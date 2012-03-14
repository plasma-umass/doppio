SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)
RESULTS = $(SOURCES:.java=.result)

test: $(RESULTS)
	cat $(RESULTS)
	@rm -f $(RESULTS)

java: $(CLASSES) $(DISASMS) $(RUNOUTS)

test/%.result: test/%.class test/%.disasm test/%.runout
	tools/run_one_test.rb test/$* >test/$*.result

test/%.disasm: test/%.class
	javap -c -verbose -private test/$* >test/$*.disasm

test/%.class: test/%.java
	javac test/$*.java

# some tests may throw exceptions. The '-' flag tells make to carry on anyway.
test/%.runout: test/%.class
	-java test/$* 2>&1 >test/$*.runout

clean:
	@rm -f *.class $(DISASMS) $(RUNOUTS) $(RESULTS)

.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS)
