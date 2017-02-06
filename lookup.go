package main

import (
  "net/http"
  "fmt"
  "io/ioutil"
  "encoding/json"
  "sync"
  "github.com/julienschmidt/httprouter"
  "strconv"
)

type lookupResponse struct {
  Url string `json:"url"`
}

var resolveCache = map[int]lookupResponse{}
var resolveCacheLock sync.Mutex

func handleResolveVideoId(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
  id, err := strconv.Atoi(params.ByName("id"))
  if err != nil {
    WriteError(w, http.StatusBadRequest, err, "Could not parse id")
    return
  }

  resolveCacheLock.Lock()
  cachedValue, cached := resolveCache[id]
  resolveCacheLock.Unlock()

  if cached {
    r.JSON(w, http.StatusOK, cachedValue)
    return
  }

  response, err := http.Get(fmt.Sprintf("http://pr0gramm.com/api/items/get?id=%d&flags=15", id))
  if err != nil {
    WriteError(w, http.StatusInternalServerError, err, "Could not lookup post.")
    return
  }

  defer response.Body.Close()

  bytes, err := ioutil.ReadAll(response.Body)
  if err != nil {
    WriteError(w, http.StatusInternalServerError, err, "Could not read response.")
    return
  }

  var target struct {
    Items []struct {
      Id    int
      Image string
    }
  }

  if err := json.Unmarshal(bytes, &target); err != nil {
    WriteError(w, http.StatusInternalServerError, err, "Could not decode pr0gramm response.")
    return
  }

  for _, item := range target.Items {
    if item.Id == id {
      result := lookupResponse{
        Url: fmt.Sprintf("https://img.pr0gramm.com/%s", item.Image),
      }

      // cache the value for next time
      resolveCacheLock.Lock()
      resolveCache[id] = result
      resolveCacheLock.Unlock()

      r.JSON(w, http.StatusOK, result)
      return
    }
  }

  WriteError(w, http.StatusNotFound, nil, "No post with this id found.")
}
