#!/usr/bin/env bash
# This script creates a JSON blob describing the speed of the test suite
# at the current HEAD commit.
set -e

read -a head_info <<< `git rev-list --timestamp --max-count 1 HEAD`
commit_time=${head_info[0]}
commit_hash=${head_info[1]}

pushd "`dirname $0`/.." >/dev/null

make --quiet release-cli

declare -a files
files=(classes/test/*.java)
last_idx=$(( ${#files[*]} - 1 ))
last_file=${files[$last_idx]}

echo -en "{\"commit\": \"$commit_hash\", \"timestamp\": $commit_time, \"tests\": {"
for testfile in "${files[@]}"; do
 classname=${testfile%.java}
 read -a results <<< `./doppio -Xbenchmark $classname | tail -2 | cut -f1 -d' '`
 cold=${results[0]}
 hot=${results[1]}
 echo -en "\n  \"${classname##*/}\": [$cold,$hot]"
 if [[ $testfile != $last_file ]]; then echo -n ","; fi
done
echo "}}"

popd >/dev/null

