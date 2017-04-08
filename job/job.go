package job

import (
  "github.com/Sirupsen/logrus"
  "math/rand"
  "sync"
)

type Job struct {
  Id         string
  OutputFile string
  Project    Project
  Progress   *Meter

  lock       sync.Mutex
  error      error
}

func NewJob(project Project) *Job {
  return &Job{
    Id:      randStringBytes(12),
    Progress: NewProgressMeter(1),
    Project: project,
  }
}

func (job *Job) Error() error {
  job.lock.Lock()
  err := job.error
  job.lock.Unlock()

  return err
}

func (job *Job) Finished() bool {
  return job.Progress.Progress() >= 1.0
}

func (job *Job) Execute() error {
  defer job.Progress.FinishNow()

  err := job.export()

  // store error code on lock
  job.lock.Lock()
  job.error = err
  job.lock.Unlock()

  return err
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

func Execute(concurrency int, jobs <-chan *Job) {
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

      if err := job.Execute(); err != nil {
        logrus.WithField("id", job.Id).Error("Export failed with error: ", err)
      }
    }()
  }
}
