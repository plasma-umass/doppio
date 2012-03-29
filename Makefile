SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)
RESULTS = $(SOURCES:.java=.result)
GIT_REV = $(shell git rev-parse HEAD)
# the order here is important: must match the order of includes
#   in the browser frontend html.
JS_SRCS = third_party/underscore-min.js \
	third_party/gLong.js \
	browser/node.js \
	src/util.js \
	src/types.js \
	src/opcodes.js \
	src/attributes.js \
	src/constant_pool.js \
	src/disassembler.js \
	src/methods.js \
	src/class_file.js \
	src/runtime.js \
	src/jvm.js \
	third_party/ace/build/src/ace.js \
	third_party/ace/build/src/mode-java.js \
	third_party/jquery.console.js \
	browser/frontend.js

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
	-java test/$* &>test/$*.runout

clean:
	@rm -f *.class $(DISASMS) $(RUNOUTS) $(RESULTS)

release:
	git submodule update --init --recursive
	coffee -c */*.coffee
	cpp -P -DRELEASE browser/doppio.html build/index.html
	for src in $(JS_SRCS); do \
		cat $${src}; \
		echo ";"; \
	done | uglifyjs --define RELEASE --no-mangle --unsafe > build/compressed.js
	rsync third_party/bootstrap/css/bootstrap.min.css build/bootstrap.min.css
	rsync -a test/special build/test/
	javac build/test/special/*.java
	ln -fs third_party build/third_party

.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS)
