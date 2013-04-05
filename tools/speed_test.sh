#!/usr/bin/env bash
# This script creates a JSON blob describing the speed of the test suite
# at the current HEAD commit.
set -e

read -a head_info <<< `git rev-list --timestamp --max-count 1 HEAD`
commit_time=${head_info[0]}
commit_hash=${head_info[1]}

pushd ..
make --quiet release-cli

echo "{'commit': '$commit_hash', 'timestamp': $commit_time, 'tests': {"
for testfile in classes/test/*.java; do
 classname=${testfile%.java}
 read -a results <<< `./doppio --benchmark $classname | tail -2 | cut -f1 -d' '`
 cold=${results[0]}
 hot=${results[1]}
 echo -e "  '${classname##*/}': [$cold,$hot],"
done
echo "}}"

popd

