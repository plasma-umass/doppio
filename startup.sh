# Warning: Do not run this as a script! Instead, do:
# user@host$ . startup.sh
# This runs the commands in your current terminal session.

ruby webrick.rb &
coffee -wc */*.coffee &
make browser/mini-rt.tar
sleep 1  # make sure we have time to compile everything
cpp -P browser/index.html index.html
tools/watch.coffee &
open http://localhost:8000/
