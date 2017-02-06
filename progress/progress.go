package progress

import (
  "sync"
  "math"
)

type Updater func(current, total int)

type Meter struct {
  steps    int

  lock     sync.Mutex
  progress float64
}

func New(steps int) *Meter {
  return &Meter{
    steps: steps,
  }
}

func (pm *Meter) Progress() float64 {
  if pm == nil {
    return 0
  }

  pm.lock.Lock()
  defer pm.lock.Unlock()

  return pm.progress;
}

func (pm *Meter) Finish() {
  pm.lock.Lock()
  defer pm.lock.Unlock()

  pm.progress = 1.0
}

func (pm *Meter) Finished() bool {
  return pm.Progress() >= 1.0
}

func (pm *Meter) Step(n int) Updater {
  return func(current, total int) {
    pm.lock.Lock()
    defer pm.lock.Unlock()

    pm.progress = (float64(n) + float64(current) / math.Max(1, float64(total))) / math.Max(1, float64(pm.steps))
  }
}
