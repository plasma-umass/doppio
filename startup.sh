#!/bin/sh
python -m SimpleHTTPServer 8000 &
coffee -wc */*.coffee &
make java
make browser/mini-rt.tar
sleep 1  # make sure we have time to compile everything
cpp -P browser/index.html index.html
rdiscount browser/_about.md >browser/_about.html
cpp -P browser/about.html about.html
cp browser/_navbar.html _navbar.html
tools/watch.coffee &
open http://localhost:8000/
