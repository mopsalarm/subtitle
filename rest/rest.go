package rest

import (
  "net/http"
  "github.com/julienschmidt/httprouter"
  "regexp"
  "encoding/json"
  "github.com/mopsalarm/s0btitle/job"
  "github.com/unrolled/render"
)

var r *render.Render = render.New()

func Setup(router *httprouter.Router, jobChannel chan <- *job.Job) {
  jobs := job.NewJobManager()

  router.POST("/api/export", handleExportVideo(jobs, jobChannel))
  router.GET("/api/export/:id", handleExportStatus(jobs))
  router.GET("/video/:id/video.mp4", handleDownloadVideo)

  router.GET("/resolve/:id", handleResolveVideoId)
}

type JobStatus struct {
  Id       string  `json:"id"`
  Finished bool    `json:"finished"`
  Progress float64 `json:"progress"`
}

func handleExportStatus(manager *job.JobManager) httprouter.Handle {
  return func(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
    id := params.ByName("id")

    foundJob := manager.Get(id)
    if foundJob == nil {
      http.NotFound(w, req)
      return
    }

    r.JSON(w, http.StatusOK, JobStatus{
      Id:       foundJob.Id,
      Finished: foundJob.Finished(),
      Progress: foundJob.Progress.Progress(),
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

func handleExportVideo(jobs *job.JobManager, jobChannel chan <- *job.Job) httprouter.Handle {
  return func(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
    var project job.Project
    if err := json.NewDecoder(req.Body).Decode(&project); err != nil {
      WriteError(w, http.StatusBadRequest, err, "Could not decode body")
      return
    }

    job := job.NewJob(project)

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
