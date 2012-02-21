#! /usr/bin/env bash

# Remove comments, ignore whitespace, and show the diff with zero lines of
# context

diff -w -B -U0 <(sed "s/\/\/.*$//" $1) <(sed "s/\/\/.*$//" $2) | sed '1,2d'
