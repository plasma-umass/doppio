#! /usr/bin/env sh

export COPYFILE_DISABLE=true
cat tools/preload | xargs tar -c > browser/mini-rt.tar
