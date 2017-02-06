#!/bin/sh

set -e

cd frontend
node_modules/.bin/tsc "$@"
