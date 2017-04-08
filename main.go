package main

import (
  "net/http"

  "github.com/Sirupsen/logrus"
  "github.com/julienschmidt/httprouter"

  "math/rand"

  "time"

  "github.com/mopsalarm/s0btitle/job"
  "github.com/mopsalarm/s0btitle/rest"
)

func main() {
  // randomize!
  rand.Seed(time.Now().UnixNano())

  // build the rest api
  router := httprouter.New()
  router.ServeFiles("/frontend/*filepath", http.Dir("frontend/"))
  router.Handler("GET", "/", http.RedirectHandler("/frontend/", http.StatusTemporaryRedirect))

  jobChannel := make(chan *job.Job, 16)

  rest.Setup(router, jobChannel)

  // start processing of jobs
  const concurrency = 2
  go job.Execute(concurrency, jobChannel)

  logrus.Info("Starting http server on :8000")
  if err := http.ListenAndServe(":8000", router); err != nil {
    logrus.Fatal("Could not serve:", err)
  }
}
