#!/bin/sh

set -e

git submodule update --init --recursive

PLATFORM=`uname -s`
PKGMGR=""

# locate's db may not exist
if locate -S >/dev/null 2>&1; then
  FIND="locate"
else
  FIND="find / -name"
fi

if [ "$PLATFORM" = "Darwin" ]; then
    if command -v brew; then
        echo "Found the homebrew package manager."
        PKGMGR="brew install"
    fi
fi

cd third_party

# check for the JCL
if [ ! -f classes/java/lang/Object.class ]; then
  for name in classes rt; do
    JCL=`$FIND "$name.jar" 2>/dev/null | head -1`
    if [ "$JCL" ]; then break; fi
  done

  echo "Extracting the Java class library from: $JCL"
  unzip -qq -d classes/ "$JCL"
fi

# check for jazzlib
if [ ! -f classes/java/util/zip/DeflaterEngine.class ]; then
  echo "patching the class library with Jazzlib"
  mkdir -p jazzlib && cd jazzlib
  if ! command -v wget >/dev/null && [ -n "$PKGMGR" ]; then
      $PKGMGR wget
  fi
  wget -q "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip"
  unzip -qq "jazzlib-binary-0.07-juz.zip"

  cp java/util/zip/*.class ../classes/java/util/zip/
  cd .. && rm -rf jazzlib
fi

if [ -z "$JAVA_HOME" ]; then
  jh_tmp=`$FIND lib/currency.data 2>/dev/null | head -1`
  jh_tmp="$(dirname "$jh_tmp"|tail -1)"
  JAVA_HOME="$(dirname "$jh_tmp"|tail -1)"
fi
ln -sfn "$JAVA_HOME" java_home

cd ..  # back to start

# Intentionally fail if node doesn't exist.
echo "Using node `node -v`"

set +e  # in case coffee doesn't exist, we can recover
CSVER=`coffee --version | fmt -1 | grep '[0-9]\+\.[0-9]\+'`
set -e

if [ -z "$CSVER" ] || [[ "$CSVER" < "1.2.0" ]]; then
  echo "Installing coffeescript ver. 1.2.0"
  npm install -g coffee-script@1.2.0
fi

#TODO: check for these before installing
npm install optimist
npm install uglify-js

echo "Using `javac -version 2>&1` to generate classfiles"
make java

if ! command -v rdiscount > /dev/null; then
    if command -v gem > /dev/null; then
        gem install rdiscount
    else
        echo "warning: could not install rdiscount because rubygems was not found"
        echo "Doppio can run without it, but rdiscount is needed for building the full website."
    fi
fi

# does sed support extended regexps?
if ! sed -r "" </dev/null >/dev/null 2>&1 && ! command -v gsed >/dev/null; then
    if [ "$PLATFORM" = "Darwin" ] && [ -n "$PKGMGR" ]; then
        $PKGMGR gnu-sed
    else
        echo "warning: sed does not seem to support extended regular expressions."
        echo "Doppio can run without this, but it is needed for building the full website."
    fi
fi

echo "Your environment should now be set up correctly."
echo "Run 'make test' (optionally with -j4) to test Doppio."
