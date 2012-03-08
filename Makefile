SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)

all: run disasm

run: $(CLASSES) $(RUNOUTS)

disasm: $(CLASSES) $(DISASMS)

test/%.disasm: test/%.class
	javap -c -verbose -private test/$* >test/$*.disasm

test/%.class: test/%.java
	javac test/$*.java

test/%.runout: test/%.class
	java test/$* 2>&1 >test/$*.runout

clean:
	rm -f test/*.class
	rm -f test/*.disasm
	rm -f test/*.runout
