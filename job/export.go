package job

import (
  "io"
  "image"
  "os"
  "github.com/Sirupsen/logrus"
  "time"
  "path/filepath"
  "sort"
  "net/http"
  "github.com/pkg/errors"
)

func (job *Job) export() error {
  var imageFiles []string

  log := logrus.WithField("id", job.Id)

  // print time it took to encode the video.
  startTime := time.Now()
  defer func() {
    log.Infof("Export job took %s", time.Since(startTime))
  }()

  project := job.Project
  job.Progress = NewProgressMeter(5)

  // create the workspace directory
  workspace := "temp/export/" + job.Id
  if err := os.MkdirAll(workspace, 0755); err != nil {
    return errors.WithMessage(err, "Could not create workspace")
  }

  // do cleanup if something fails.
  defer func() {
    log.Info("Cleanup")
    cleanupWorkspace(workspace, imageFiles)
  }()

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

  log.Info("Converting video to frames (and downscale them)")
  err := FFmpeg(workspace, job.Progress.Step(1), "-i", "original.mp4",
    "-vf", "scale='min(iw,848)':-2,fps=25:start_time=0",
    "-y", "-q:v", "5", "-an", "frame-%06d.jpg")

  if err != nil {
    return errors.WithMessage(err, "Could not extract frames from video")
  }

  log.Info("Looking for frames.")
  imageFiles, err = filepath.Glob(workspace + "/frame-*.jpg")
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

  // encode video to .mp4
  job.OutputFile = workspace + "/rendered.mp4"
  if err := job.encodeVideo(workspace, log, hasAudio); err != nil {
    return err
  }

  log.Info("Finished")
  return nil
}

func (job *Job) encodeVideo(workspace string, log logrus.FieldLogger, hasAudio bool) error {
  bitrate := "600"

  for passIndex, pass := range []string{"1", "2"} {
    var command []string
    command = append(command, "-r", "25", "-i", "frame-%06d.jpg")

    hasAudioThisPass := passIndex > 0 && hasAudio
    if hasAudioThisPass {
      command = append(command, "-i", "original.mp4")
    }

    command = append(command, "-map", "0:v")

    if hasAudioThisPass {
      command = append(command, "-map", "1:a", "-codec:a", "copy", "-shortest")
    }

    command = append(command,
      "-b:v", bitrate + "k", "-codec:v", "libx264", "-profile:v", "high", "-level", "4.2",
      "-pass", pass, "-y", "rendered.mp4")

    log.Infof("Encode frames to video (pass %s)", pass)
    err := FFmpeg(workspace, job.Progress.Step(3 + passIndex), command...)
    return errors.WithMessage(err, "Error encoding the video in pass " + pass)
  }

  return nil
}

func downloadToFile(url string, target string, progress ProgressUpdater) error {
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

func cleanupWorkspace(workspace string, imageFiles[] string) {
  os.Remove(workspace + "/original.mp4")
  os.Remove(workspace + "/ffmpeg2pass-0.log")
  os.Remove(workspace + "/ffmpeg2pass-0.log.mbtree")
  for _, file := range imageFiles {
    os.Remove(file)
  }
}

