#!/bin/sh
set -e
python -m SimpleHTTPServer 8000 &
coffee -wc */*.coffee &
sleep 1  # make sure we have time to compile everything
cpp -P browser/doppio.html index.html
./watch.coffee &
open http://localhost:8000/
