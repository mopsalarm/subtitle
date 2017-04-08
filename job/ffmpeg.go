package job

import (
  "time"
  "regexp"
  "strconv"
  "bytes"
  "os/exec"
  "os"
  "encoding/json"
  "github.com/Sirupsen/logrus"
  "strings"
  "io"
  "github.com/pkg/errors"
)

type VideoInfo struct {
  Streams []struct {
    Index int
    Type  string `json:"codec_type"`
  }
}

func ReadVideoInfo(filename string) (*VideoInfo, error) {
  var stdout bytes.Buffer
  cmd := exec.Command("ffprobe", "-hide_banner", "-loglevel", "error", "-print_format", "json", "-show_streams", filename)

  cmd.Stdout = &stdout
  cmd.Stderr = os.Stdout

  if err := cmd.Run(); err != nil {
    return nil, errors.WithMessage(err, "Could not run ffprobe")
  }

  // decode result as json
  var result VideoInfo
  err := json.NewDecoder(&stdout).Decode(&result)
  return &result, errors.WithMessage(err, "Could not decode ffprobe output")
}

func FFmpeg(workspace string, progress ProgressUpdater, args ...string) error {
  logrus.Debug("ffmpeg ", strings.Join(args, " "))

  // prepend a few defaults to the arguments
  args = append([]string{"-hide_banner", "-loglevel", "info", "-stats"}, args...)

  cmd := exec.Command("ffmpeg", args...)

  cmd.Dir = workspace

  var stderr bytes.Buffer
  cmd.Stderr = &ffmpegTimeProgressWriter{
    Progress: progress,
    Delegate: &stderr,
  }

  // finish once ffmpeg stops
  defer progress(1, 1)

  if err := cmd.Run(); err != nil {
    logrus.Warn("ffmpeg failed with %s, stderr was: %s", err, stderr.String())
    return errors.WithMessage(err, "Could not run ffmpeg")
  }

  return nil
}

type ffmpegTimeProgressWriter struct {
  Delegate  io.Writer
  Progress  ProgressUpdater

  totalTime *time.Duration
}

func (w *ffmpegTimeProgressWriter) Write(p []byte) (int, error) {
  if w.Progress != nil {
    line := string(p)

    if w.totalTime == nil {
      w.totalTime = parseTime(line, "Duration: ")
    }

    if w.totalTime != nil {
      currentTime := parseTime(line, "time=")
      if currentTime != nil {
        logrus.Infof("ffmpeg progress at %s of %s", *currentTime, *w.totalTime)
        w.Progress(int(*currentTime), int(*w.totalTime))
      }
    }
  }

  if w.Delegate != nil {
    return w.Delegate.Write(p)
  } else {
    return len(p), nil
  }
}

func parseTime(line, prefix string) *time.Duration {
  var result *time.Duration

  re := regexp.MustCompile(regexp.QuoteMeta(prefix) + `(\d\d):(\d\d):(\d\d)\.(\d\d)`)
  match := re.FindStringSubmatch(line)
  if match != nil {
    hours, _ := strconv.Atoi(match[1])
    minutes, _ := strconv.Atoi(match[2])
    seconds, _ := strconv.Atoi(match[3])
    milliseconds, _ := strconv.Atoi(match[4] + "0")

    duration := time.Duration(((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds) * time.Millisecond
    result = &duration
  }

  return result
}
