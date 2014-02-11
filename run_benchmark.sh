#!/usr/bin/env bash

function run_command(){
	# Throw one away
	echo "Running warm-up run..."
	eval $1 > /dev/null
	echo "Running real runs."
	time eval $1 > /dev/null
	time eval $1 > /dev/null
	time eval $1 > /dev/null
}


if [ "$1" = "kawa" ]
then
	run_command "java -Xint -jar jars/kawa-1.13.jar -f benchmark/kawa/nqueens2.sch"
elif [ "$1" = "rhino" ]
then
	# Special: Rhino has its own runner.
	cd benchmark/rhino
	java -Xint -jar ../../jars/js.jar -f run.js
	cd -
elif [ "$1" = "javap" ]
then
	# We had to make a separate class, since the CLI args were too long.
	run_command "java -Xint classes/util/JavapBenchmark"
elif [ "$1" = "javac" ]
then
	run_command "java -Xint classes/util/Javac benchmark/javap/AttrData.java benchmark/javap/ClassData.java benchmark/javap/Constants.java benchmark/javap/CPX.java benchmark/javap/CPX2.java benchmark/javap/FieldData.java benchmark/javap/InnerClassData.java benchmark/javap/JavapEnvironment.java benchmark/javap/JavapPrinter.java benchmark/javap/LineNumData.java benchmark/javap/LocVarData.java benchmark/javap/Main.java benchmark/javap/MethodData.java benchmark/javap/RuntimeConstants.java benchmark/javap/StackMapData.java benchmark/javap/StackMapTableData.java benchmark/javap/Tables.java benchmark/javap/TrapData.java benchmark/javap/TypeSignature.java"
else
	echo "Usage: ./run-benchmark.sh [kawa|rhino|javap|javac]"
fi
