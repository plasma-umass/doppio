# Force the use of bash for shell statements. If we don't do this, many Linux
# variants will use sh.
SHELL := /bin/bash

# Can be overridden on the command line. This is the name of the tar.gz file
# produced when you run `make dist'.
DIST_NAME = $(shell echo "Doppio_`date +'%y-%m-%d'`.tar.gz")

# DEPENDENCIES
COFFEEC  := node_modules/coffee-script/bin/coffee
UGLIFYJS := node_modules/uglify-js/bin/uglifyjs
OPTIMIST := node_modules/optimist/index.js
DOCCO    := node_modules/docco/bin/docco
JAZZLIB  := third_party/classes/java/util/zip/DeflaterEngine.class
JRE      := third_party/classes/java/lang/Object.class

# JAVA TEST CLASSES & DEMOS
SOURCES = $(wildcard test/*.java)
DISASMS = $(SOURCES:.java=.disasm)
RUNOUTS = $(SOURCES:.java=.runout)
CLASSES = $(SOURCES:.java=.class)
RESULTS = $(SOURCES:.java=.result)
DEMO_SRCS = $(wildcard test/special/*.java) test/FileRead.java test/Fib.java
DEMO_CLASSES = $(DEMO_SRCS:.java=.class)

# HTML
BROWSER_HTML = $(wildcard browser/[^_]*.html)
RLS_BUILD_DIR = build/release
BMK_BUILD_DIR = build/benchmark
RLS_BUILD_HTML = $(addprefix $(RLS_BUILD_DIR)/, $(notdir $(BROWSER_HTML)))
BMK_BUILD_HTML = $(addprefix $(BMK_BUILD_DIR)/, $(notdir $(BROWSER_HTML)))

# SCRIPTS
# the order here is important: must match the order of includes
# in the browser frontend html.
COMMON_BROWSER_SRCS = third_party/_.js \
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
	browser/untar.coffee
# Release uses the actual jQuery console.
release_BROWSER_SRCS = $(COMMON_BROWSER_SRCS) \
	third_party/jquery.console.js \
	browser/frontend.coffee
# Benchmark uses the mock jQuery console.
benchmark_BROWSER_SRCS = $(COMMON_BROWSER_SRCS) \
	browser/mockconsole.coffee \
	browser/frontend.coffee
# they don't survive uglifyjs and are already minified, so include them
# separately. also, this allows us to put them at the end of the document to
# reduce load time.
ACE_SRCS = third_party/ace/src-min/ace.js \
	third_party/ace/src-min/mode-java.js \
	third_party/ace/src-min/theme-twilight.js

################################################################################
# TARGETS
################################################################################

# Builds a release version of Doppio without the documentation.
release: dependencies $(RLS_BUILD_DIR)/browser $(RLS_BUILD_HTML) \
	$(RLS_BUILD_DIR)/compressed.js browser/mini-rt.tar $(RLS_BUILD_DIR)/ace.js \
	$(RLS_BUILD_DIR)/browser/style.css $(DEMO_CLASSES)
	git submodule update --init --recursive
	rsync -R $(DEMO_SRCS) $(DEMO_CLASSES) test/special/foo test/special/bar $(RLS_BUILD_DIR)/
	rsync -a test/special $(RLS_BUILD_DIR)/test
	rsync browser/mini-rt.tar $(RLS_BUILD_DIR)/browser/mini-rt.tar
	rsync browser/*.svg $(RLS_BUILD_DIR)/browser/
	rsync browser/*.png $(RLS_BUILD_DIR)/browser/

# Installs or checks for any required dependencies.
dependencies: $(COFFEEC) $(UGLIFYJS) $(OPTIMIST) $(JAZZLIB) $(JRE) $(DOCCO)
$(COFFEEC):
	npm install coffee-script@1.3.3
$(UGLIFYJS):
	npm install uglify-js
$(OPTIMIST):
	npm install optimist
$(DOCCO):
	npm install docco
$(JAZZLIB):
	$(error JazzLib not found. Unzip it to third_party/classes/, or run ./tools/setup.sh.)
$(JRE):
	$(error Java class library not found. Unzip it to third_party/classes/, or run ./tools/setup.sh.)

# Used to test the chosen Java compiler in setup.sh.
java: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)

# Runs the Java tests in ./test with the node runner.
test: dependencies $(RESULTS)
	cat $(RESULTS)
	@rm -f $(RESULTS)
%.class: %.java
	javac $^
test/%.result: test/%.class test/%.disasm test/%.runout
	tools/run_one_test.rb test/$* >test/$*.result
test/%.disasm: test/%.class
	javap -c -verbose -private test/$* >test/$*.disasm
# some tests may throw exceptions. The '-' flag tells make to carry on anyway.
test/%.runout: test/%.class
	-java test/$* &>test/$*.runout

clean:
	@rm -f $(CLASSES) $(DISASMS) $(RUNOUTS) $(RESULTS)
	@rm -f src/*.js browser/*.js console/*.js tools/*.js
	@rm -rf build/* browser/mini-rt.jar $(DEMO_CLASSES)
	@rm -f index.html

# Builds a distributable version of Doppio.
dist: $(DIST_NAME)
$(DIST_NAME): release docs
	tar czf $(DIST_NAME) $(RLS_BUILD_DIR)

# docs need to be generated in one shot so docco can create the full jumplist.
# This is slow, so we have it as a separate target (even though it is needed
# for a full release build).
docs: dependencies $(RLS_BUILD_DIR)
	$(DOCCO) $(filter %.coffee, $(release_BROWSER_SRCS))
	rm -rf $(RLS_BUILD_DIR)/docs
	mv docs $(RLS_BUILD_DIR)

browser/mini-rt.tar: tools/preload
	COPYFILE_DISABLE=true && tar -c -T tools/preload -f $@

################################################################################
# BUILD DIRECTORY TARGETS
################################################################################
# Double colon: Can execute multiple times in one `make' invocation.
$(RLS_BUILD_DIR) $(BMK_BUILD_DIR) build/%/browser::
	mkdir -p $@

browser/_about.html: browser/_about.md
	rdiscount $? > $@
browser/about.html: browser/_about.html

$(RLS_BUILD_DIR)/%.html $(BMK_BUILD_DIR)/%.html: $(BROWSER_HTML) $(wildcard browser/_*.html)
	cpp -P -traditional-cpp -DRELEASE browser/$*.html $@

build/%/compressed.js: $(BROWSER_SRCS)
	if command -v gsed >/dev/null; then \
		SED="gsed"; \
	else \
		SED="sed"; \
	fi; \
	for src in $($(*)_BROWSER_SRCS); do \
		if [ "$${src##*.}" == "coffee" ]; then \
			$(: `` is essentially Coffeescript's equivalent of Python's 'pass') \
			cat $${src} | $$SED -r "s/^( *)(debug|trace).*$$/\1\`\`/" | $(COFFEEC) --stdio --print; \
		else \
			cat $${src}; \
		fi; \
		echo ";"; \
	done | $(UGLIFYJS) --define RELEASE --no-mangle --unsafe > $@
	if [ ! -s $@ ]; then echo "Coffeescript compilation error"; rm -f $@; fail; fi

build/%/ace.js: $(ACE_SRCS)
	for src in $(ACE_SRCS); do \
		cat $${src}; \
		echo ";"; \
	done > $@

# The | prevents the rule from being included in $^.
build/%/browser/style.css: third_party/bootstrap/css/bootstrap.min.css \
	browser/style.css | build/%/browser
	cat $^ > $@

# Never delete these files in the event of a failure.
.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)
