#!/bin/sh

set -e

./build-frontend.sh

CGO_ENABLED=0 ./build.sh

docker build -t mopsalarm/s0btitle .
docker push mopsalarm/s0btitle
