package job

import "sync"

// more or less a synchronized map of jobs
type JobManager struct {
  lock sync.Mutex
  jobs map[string]*Job
}

func NewJobManager() *JobManager {
  return &JobManager{jobs: make(map[string]*Job)}
}

func (jm *JobManager) Put(job *Job) {
  jm.lock.Lock()
  jm.jobs[job.Id] = job
  jm.lock.Unlock()
}

func (jm *JobManager) Get(id string) *Job {
  jm.lock.Lock()
  job := jm.jobs[id]
  jm.lock.Unlock()

  return job
}
