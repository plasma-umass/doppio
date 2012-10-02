#!/bin/sh
set -e

jarfile=$1
if [[ -z "$jarfile" || "${jarfile##*.}" != "jar" ]]; then
  echo "Usage: $0 file_to_run.jar"
  exit 1
fi

jarname=`basename $jarfile`
tmpdir="/tmp/doppio_${jarname%.*}_jar"
mkdir $tmpdir
unzip -qq $jarfile -d $tmpdir

toolsdir="$( cd -P "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
runner="$toolsdir/../console/runner.coffee"

pushd $tmpdir
mainclass=`grep 'Main-Class' META-INF/MANIFEST.MF | cut -d' ' -f2 | tr '.' '/'`
# strange hack to remove trailing carriage returns
mainclass="${mainclass%"${mainclass##*[![:space:]]}"}"

if [ -z "$mainclass" ]; then
  echo "Error: Could not find a Main-Class in the manifest"
  exit 2
fi

shift
set +e
$runner $mainclass $@
popd

rm -rf $tmpdir
