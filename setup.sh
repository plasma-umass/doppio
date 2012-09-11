#!/bin/sh

set -e

git submodule update --init --recursive

cd third_party

for name in rt classes; do
  JCL=`locate "/$name.jar" | head -1`
  if [ "$JCL" ]; then break; fi
done

echo "Extracting the Java class library from: $JCL"
unzip -qq -d classes/ "$JCL"

echo "patching the class library with Jazzlib"
mkdir -p jazzlib && cd jazzlib
wget -q "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip"
unzip -qq "jazzlib-binary-0.07-juz.zip"
ls
cp java/util/zip/*.class ../classes/java/util/zip/
cd .. && rm -rf jazzlib

if [ -z "$JAVA_HOME" ]; then
  jh_tmp=`locate lib/currency.data | head -1`
  jh_tmp="$(dirname "$jh_tmp"|tail -1)"
  JAVA_HOME="$(dirname "$jh_tmp"|tail -1)"
fi
ln -sf "$JAVA_HOME" java_home

cd ..  # back to start

# Intentionally fail if node doesn't exist.
echo "Using node `node -v`"

set +e  # in case coffee doesn't exist, we can recover
CSVER=`coffee --version | fmt -1 | grep '\d\+\.\d\+'`
set -e

if [ -z "$CSVER" ] || [[ "$CSVER" < "1.2.0" ]]; then
  echo "Installing coffeescript ver. 1.2.0"
  npm install -g coffee-script@1.2.0
fi

#TODO: check for this before installing
npm install optimist

echo "Using `javac -version` to generate classfiles"
make java

echo "Your environment should now be set up correctly."
echo "Run 'make test' (optionally with -j4) to test Doppio."
