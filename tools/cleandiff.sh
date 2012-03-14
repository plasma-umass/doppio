#! /usr/bin/env bash

# Remove comments, ignore whitespace, and show the diff with zero lines of
# context. Also ignore the specifics of how doubles and floats are printed...
diff -w -B -U0 <(sed "s/\/\/.*$//" $1 | sed "s/float	.*/float/" | sed "s/double	.*/double/") \
               <(sed "s/\/\/.*$//" $2 | sed "s/float	.*/float/" | sed "s/double	.*/double/") \
               | sed '1,2d'
