#!/bin/sh
set -e
python -m SimpleHTTPServer 8000 &
coffee -wc */*.coffee &
sleep 1  # make sure we have time to compile everything
cpp -P browser/index.html index.html
cpp -P browser/about.html about.html
cp browser/_navbar.html _navbar.html
tools/watch.coffee &
open http://localhost:8000/
