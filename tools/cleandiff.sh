#! /usr/bin/env bash

# Remove comments, ignore whitespace, and show the diff with zero lines of
# context

diff -w -U0 <(cat $1 | sed "s/\/\/.*$//") <(cat $2 | sed "s/\/\/.*$//")
