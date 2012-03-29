#! /usr/bin/env sh

export COPYFILE_DISABLE=true
cat tools/preload | gsed -r "s/.*/third_party\/classes\/\0.class/" | xargs tar -c > browser/mini-rt.tar
