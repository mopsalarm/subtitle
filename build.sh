#!/bin/sh

set -e

# pack the assets/ directory into the binary
go-bindata -pkg job -o job/bindata.go assets/

go build
