#!/bin/sh

set -e

go-bindata assets/
go build
