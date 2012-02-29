#!/bin/sh

python -m SimpleHTTPServer 8000 &
coffee -wc */*.coffee &
sleep 1  # make sure we have time to compile everything
open http://localhost:8000/
