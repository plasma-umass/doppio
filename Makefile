SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)
RESULTS = $(SOURCES:.java=.result)
DEMO_SRCS = $(wildcard test/special/*.java) test/FileRead.java
DEMO_CLASSES = $(DEMO_SRCS:.java=.class)
BROWSER_HTML = $(wildcard browser/[^_]*.html)
BUILD_HTML = $(addprefix build/, $(notdir $(BROWSER_HTML)))
# the order here is important: must match the order of includes
#   in the browser frontend html.
BROWSER_SRCS = third_party/underscore-min.js \
	third_party/gLong.js \
	browser/util.coffee \
	browser/node.coffee \
	src/util.coffee \
	src/types.coffee \
	src/opcodes.coffee \
	src/attributes.coffee \
	src/constant_pool.coffee \
	src/disassembler.coffee \
	src/natives.coffee \
	src/methods.coffee \
	src/class_file.coffee \
	src/runtime.coffee \
	src/jvm.coffee \
	third_party/jquery.console.js \
	browser/untar.coffee \
	browser/frontend.coffee
# they don't survive uglifyjs and are already minified, so include them
# separately. also, this allows us to put them at the end of the document to
# reduce load time.
ACE_SRCS = third_party/ace/build/src/ace.js \
	third_party/ace/build/src/mode-java.js \
	third_party/ace/build/src/theme-twilight.js

test: $(RESULTS)
	cat $(RESULTS)
	@rm -f $(RESULTS)

java: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)

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
	@rm -rf build/* browser/mini-rt.jar $(DEMO_CLASSES)

release: $(BUILD_HTML) build/compressed.js browser/mini-rt.tar build/ace.js \
	build/browser/style.css $(DEMO_CLASSES)
	git submodule update --init --recursive
	mkdir -p build/browser
	rsync -R $(DEMO_SRCS) $(DEMO_CLASSES) test/special/foo test/special/bar build/
	rsync browser/mini-rt.tar build/browser/mini-rt.tar
	rsync browser/*.svg build/browser/
	rsync browser/*.png build/browser/

# docs need to be generated in one shot so docco can create the full jumplist.
# This is slow, so we have it as a separate target (even though it is needed
# for a full release build).
docs:
	docco $(filter %.coffee, $(BROWSER_SRCS))
	rm -rf build/docs
	mv docs build/

test/special/%.class: test/special/%.java
	javac build/test/special/*.java

browser/_about.html: browser/_about.md
	rdiscount $? > $@

build/about.html: browser/_about.html

build/%.html: $(BROWSER_HTML) $(wildcard browser/_*.html)
	cpp -P -DRELEASE browser/$*.html build/$*.html

build/compressed.js: $(BROWSER_SRCS)
	for src in $(BROWSER_SRCS); do \
		if [ "$${src##*.}" == "coffee" ]; then \
			cat $${src} | gsed -r "s/^ *(debug|trace).*$$//" | coffee --stdio --print; \
		else \
			cat $${src}; \
		fi; \
		echo ";"; \
	done | uglifyjs --define RELEASE --no-mangle --unsafe > build/compressed.js

build/ace.js: $(ACE_SRCS)
	for src in $(ACE_SRCS); do \
		cat $${src}; \
		echo ";"; \
	done > build/ace.js

build/browser/style.css: third_party/bootstrap/css/bootstrap.min.css browser/style.css
	cat $^ > $@

browser/mini-rt.tar: tools/preload
	tools/make-rt.sh

.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)
.INTERMEDIATE: browser/_about.html
