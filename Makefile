COFFEEC = coffee # path to coffeescript compiler
UGLIFYJS = ~/node_modules/uglify-js/bin/uglifyjs

SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)
RESULTS = $(SOURCES:.java=.result)
DEMO_SRCS = $(wildcard test/special/*.java) test/FileRead.java test/Fib.java
DEMO_CLASSES = $(DEMO_SRCS:.java=.class)
BROWSER_HTML = $(wildcard browser/[^_]*.html)
BUILD_HTML = $(addprefix build/, $(notdir $(BROWSER_HTML)))
# the order here is important: must match the order of includes
#   in the browser frontend html.
BROWSER_SRCS = third_party/_.js \
	third_party/gLong.js \
	browser/util.coffee \
	browser/node.coffee \
	src/util.coffee \
	src/types.coffee \
	src/opcodes.coffee \
	src/attributes.coffee \
	src/ConstantPool.coffee \
	src/disassembler.coffee \
	src/natives.coffee \
	src/methods.coffee \
	src/ClassFile.coffee \
	src/runtime.coffee \
	src/jvm.coffee \
	browser/mockconsole.coffee \
	browser/untar.coffee \
	browser/frontend.coffee
# they don't survive uglifyjs and are already minified, so include them
# separately. also, this allows us to put them at the end of the document to
# reduce load time.
ACE_SRCS = third_party/ace/src-min/ace.js \
	third_party/ace/src-min/mode-java.js \
	third_party/ace/src-min/theme-twilight.js

jre: third_party/classes/java/lang/String.class
third_party/classes/java/lang/String.class:
	$(error Java class library not found. Unzip it to third_party/classes/)

test: jre $(RESULTS)
	cat $(RESULTS)
	@rm -f $(RESULTS)

java: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)

test/%.result: test/%.class test/%.disasm test/%.runout
	#tools/run_one_test.rb test/$* >test/$*.result

test/%.disasm: test/%.class
	#javap -c -verbose -private test/$* >test/$*.disasm

test/%.class: test/%.java
	#javac test/$*.java

# some tests may throw exceptions. The '-' flag tells make to carry on anyway.
test/%.runout: test/%.class
	-java test/$* &>test/$*.runout

clean:
	@rm -f *.class $(DISASMS) $(RUNOUTS) $(RESULTS)
	@rm -f src/*.js browser/*.js console/*.js tools/*.js
	@rm -rf build/* browser/mini-rt.jar $(DEMO_CLASSES)

release: $(BUILD_HTML) build/compressed.js browser/mini-rt.tar build/ace.js \
	build/browser/style.css $(DEMO_CLASSES)
	git submodule update --init --recursive
	mkdir -p build/browser
	#rsync -R $(DEMO_SRCS) $(DEMO_CLASSES) test/special/foo test/special/bar build/
	rsync -a test/special build/test
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
	cpp -P -traditional-cpp -DRELEASE browser/$*.html build/$*.html

build/compressed.js: $(BROWSER_SRCS)
	if command -v gsed >/dev/null; then \
		SED="gsed"; \
	else \
		SED="sed"; \
	fi; \
	for src in $(BROWSER_SRCS); do \
		if [ "$${src##*.}" == "coffee" ]; then \
			$(: `` is essentially Coffeescript's equivalent of Python's 'pass') \
			cat $${src} | $$SED -r "s/^( *)(debug|trace).*$$/\1\`\`/" | $(COFFEEC) --stdio --print; \
		else \
			cat $${src}; \
		fi; \
		echo ";"; \
	done | $(UGLIFYJS) --define RELEASE --no-mangle --unsafe > build/compressed.js

build/ace.js: $(ACE_SRCS)
	for src in $(ACE_SRCS); do \
		cat $${src}; \
		echo ";"; \
	done > build/ace.js

build/browser/style.css: third_party/bootstrap/css/bootstrap.min.css browser/style.css
	mkdir -p build/browser
	cat $^ > $@

browser/mini-rt.tar: tools/preload
	COPYFILE_DISABLE=true && tar -c -T tools/preload -f browser/mini-rt.tar

.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)
.INTERMEDIATE: browser/_about.html
