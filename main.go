package main

import (
  "net/http"

  "github.com/Sirupsen/logrus"
  "github.com/julienschmidt/httprouter"

  "math/rand"

  "github.com/unrolled/render"

  "encoding/json"
  "image"
  "io"
  "os"
  "path/filepath"
  "regexp"
  "sort"
  "sync"
  "time"

  "github.com/pkg/errors"
  "github.com/mopsalarm/s0btitle/progress"
)

var r *render.Render = render.New()

func main() {
  // randomize!
  rand.Seed(time.Now().UnixNano())

  // build the rest api
  router := httprouter.New()
  router.ServeFiles("/frontend/*filepath", http.Dir("frontend/"))
  router.Handler("GET", "/", http.RedirectHandler("/frontend/", http.StatusTemporaryRedirect))

  jobs := NewJobManager()
  jobChannel := make(chan *ExportJob, 1024)
  router.POST("/api/export", handleExportVideo(jobs, jobChannel))
  router.GET("/api/export/:id", handleExportStatus(jobs))
  router.GET("/video/:id/video.mp4", handleDownloadVideo)

  router.GET("/resolve/:id", handleResolveVideoId)

  // start processing of jobs
  go RunExportJobs(2, jobChannel)

  if err := http.ListenAndServe(":8000", router); err != nil {
    logrus.Fatal("Could not serve:", err)
  }
}

type JobStatus struct {
  Id       string  `json:"id"`
  Finished bool    `json:"finished"`
  Progress float64 `json:"progress"`
}

func handleExportStatus(manager *JobManager) httprouter.Handle {
  return func(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
    id := params.ByName("id")

    job := manager.Get(id)
    if job == nil {
      http.NotFound(w, req)
      return
    }

    r.JSON(w, http.StatusOK, JobStatus{
      Id:       job.Id,
      Finished: job.Finished(),
      Progress: job.Progress.Progress(),
    })
  }
}

func handleDownloadVideo(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
  id := params.ByName("id")

  if !regexp.MustCompile("^[a-zA-Z]+$").MatchString(id) {
    http.Error(w, "Invalid id.", http.StatusForbidden)
    return
  }

  // serve file, hopefully it is still there.
  http.ServeFile(w, req, "temp/export/" + id + "/rendered.mp4")
}

func handleExportVideo(jobs *JobManager, jobChannel chan <- *ExportJob) httprouter.Handle {
  return func(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
    var project Project
    if err := json.NewDecoder(req.Body).Decode(&project); err != nil {
      WriteError(w, http.StatusBadRequest, err, "Could not decode body")
      return
    }

    job := NewExport(project)

    jobs.Put(job)
    jobChannel <- job

    r.JSON(w, http.StatusOK, map[string]string{"jobId": job.Id})
  }
}

func WriteError(writer http.ResponseWriter, status int, err error, msg string) {
  if err != nil {
    http.Error(writer, msg + ": " + err.Error(), status)
  } else {
    http.Error(writer, msg, status)
  }
}

type JobManager struct {
  lock sync.Mutex
  jobs map[string]*ExportJob
}

func NewJobManager() *JobManager {
  return &JobManager{jobs: make(map[string]*ExportJob)}
}

func (jm *JobManager) Put(job *ExportJob) {
  jm.lock.Lock()
  jm.jobs[job.Id] = job
  jm.lock.Unlock()
}

func (jm *JobManager) Get(id string) *ExportJob {
  jm.lock.Lock()
  job := jm.jobs[id]
  jm.lock.Unlock()

  return job
}

type ExportJob struct {
  Id         string
  Project    Project
  Progress   *progress.Meter

  OutputFile string

  error      error
}

func RunExportJobs(concurrency int, jobs <-chan *ExportJob) {
  limitter := make(chan bool, concurrency)
  defer close(limitter)

  for job_ := range jobs {
    job := job_

    // limit number of running jobs
    limitter <- true

    go func() {
      defer func() {
        // allow another job to start
        <-limitter
      }()

      if err := job.Export(); err != nil {
        logrus.WithField("id", job.Id).Error("Export failed with error: ", err)
      }
    }()
  }
}

func NewExport(project Project) *ExportJob {
  return &ExportJob{
    Id:      randStringBytes(12),
    Project: project,
    Progress: progress.New(1),
  }
}

func (job *ExportJob) Error() error {
  err := job.error
  return err
}

func (job *ExportJob) Finished() bool {
  return job.Progress.Progress() >= 1.0
}

func (job *ExportJob) Export() error {
  err := job.export()
  job.error = err
  return err
}

func (job *ExportJob) export() error {
  log := logrus.WithField("id", job.Id)

  job.Progress = progress.New(5)

  project := job.Project
  workspace := "temp/export/" + job.Id

  // create the workspace directory
  if err := os.MkdirAll(workspace, 0755); err != nil {
    return errors.WithMessage(err, "Could not create workspace")
  }

  log.Info("Downloading original video")
  if err := downloadToFile(project.Video, workspace + "/original.mp4", job.Progress.Step(0)); err != nil {
    return errors.WithMessage(err, "Could not download original video")
  }

  // read video information first - fail early
  hasAudio := false
  if !project.Silent {
    log.Info("Check for audio stream in original video")
    videoInfo, err := ReadVideoInfo(workspace + "/original.mp4")
    if err != nil {
      return errors.WithMessage(err, "Could not get video information from file.")
    }

    hasAudio = len(videoInfo.Streams) > 1
  }

  log.Info("Converting video to frames")
  err := FFmpeg(workspace, job.Progress.Step(1), "-i", "original.mp4",
    "-vf", "scale='min(iw,848)':-2,fps=25:start_time=0",
    "-y", "-q:v", "5", "-an", "frame-%06d.jpg")

  if err != nil {
    return errors.WithMessage(err, "Could not extract frames from video")
  }

  log.Info("Looking for frames.")
  imageFiles, err := filepath.Glob(workspace + "/frame-*.jpg")
  if err != nil {
    return errors.WithMessage(err, "Could not find the generated frames")
  }

  // sort images correctly
  sort.Strings(imageFiles)

  log.Info("Read image size from first frame")
  config, err := readImageConfig(imageFiles[0])
  if err != nil {
    return errors.WithMessage(err, "Could not read image size from first frame")
  }

  fontSize := float64(config.Height) / 16

  log.Info("Loading subtitle font-file")
  ff, err := LoadFontFace("assets/font.ttf", fontSize)
  if err != nil {
    return errors.WithMessage(err, "Couldn ot load subtitle font")
  }

  // update every image.
  log.Infof("Render %d subtitles", len(project.Subtitles))
  for idx, file := range imageFiles {
    currentTime := float64(idx) / 25.0

    // update the progress bar
    job.Progress.Step(2)(idx, len(imageFiles))

    // get the list of subtitles for this image
    var subtitles []Subtitle
    for _, subtitle := range project.Subtitles {
      if subtitle.Time <= currentTime && currentTime <= subtitle.Time + subtitle.Duration {
        subtitles = append(subtitles, subtitle)
      }
    }

    // we do not need to touch the image if we have no subtitles
    if len(subtitles) == 0 {
      continue
    }

    // draw them
    if err := RenderSubtitles(file, ff, fontSize, subtitles); err != nil {
      return errors.WithMessage(err, "Could not render subtitles")
    }
  }

  bitrate := "600"

  job.OutputFile = workspace + "/rendered.mp4"

  for passIndex, pass := range []string{"1", "2"} {
    var command []string
    command = append(command, "-r", "25", "-i", "frame-%06d.jpg")

    if hasAudio {
      command = append(command, "-i", "original.mp4")
    }

    command = append(command, "-map", "0:v")

    if hasAudio {
      command = append(command, "-map", "1:a", "-codec:a", "copy", "-shortest")
    }

    command = append(command,
      "-preset", "slow", "-b:v", bitrate + "k", "-codec:v", "libx264", "-profile:v", "high", "-level", "4.2",
      "-pass", pass, "-y", "rendered.mp4")

    log.Infof("Encode frames to video (pass %s)", pass)
    err = FFmpeg(workspace, job.Progress.Step(3 + passIndex), command...)


    if err != nil {
      return errors.WithMessage(err, "Error encoding the video in pass " + pass)
    }
  }

  log.Info("Cleanup")
  os.Remove(workspace + "/original.mp4")
  os.Remove(workspace + "/ffmpeg2pass-0.log")
  os.Remove(workspace + "/ffmpeg2pass-0.log.mbtree")
  for _, file := range imageFiles {
    os.Remove(file)
  }

  job.Progress.Finish()

  log.Info("Finished.")
  return nil
}

func downloadToFile(url string, target string, progress progress.Updater) error {
  resp, err := http.Get(url)
  if err != nil {
    return err
  }

  defer resp.Body.Close()

  fp, err := os.Create(target)
  if err != nil {
    return err
  }

  defer fp.Close()

  var buffer [16 * 1024]byte

  written := 0
  for {
    // read the buffer
    n, err := resp.Body.Read(buffer[:])
    if err == io.EOF {
      break
    }

    if err != nil {
      return err
    }

    // write the data we've read
    _, err = fp.Write(buffer[:n])
    if err != nil {
      return err
    }

    if resp.ContentLength > 0 {
      written += int(n)
      progress(written, int(resp.ContentLength))
    }
  }

  return nil
}

func readImageConfig(filename string) (image.Config, error) {
  fp, err := os.Open(filename)
  if err != nil {
    return image.Config{}, err
  }

  defer fp.Close()

  config, _, err := image.DecodeConfig(fp)
  return config, err
}

// Returns a random id of the given length.
func randStringBytes(n int) string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

  b := make([]byte, n)
  for i := range b {
    b[i] = letters[rand.Intn(len(letters))]
  }

  return string(b)
}
