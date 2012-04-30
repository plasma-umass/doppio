#!/bin/sh
python -m SimpleHTTPServer 8000 &
coffee -wc */*.coffee &
make java
make browser/mini-rt.tar
sleep 1  # make sure we have time to compile everything
cpp -P browser/index.html index.html
tools/watch.coffee &
open http://localhost:8000/
