# Warning: Do not run this as a script! Instead, do:
# user@host$ . startup.sh
# This runs the commands in your current terminal session.

tools/webrick.rb --dev &
make development
coffee -wc */*.coffee &
tools/watch.coffee &
open http://localhost:8000/
