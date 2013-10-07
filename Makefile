# Force the use of bash for shell statements. If we don't do this, many Linux
# variants will use sh.
SHELL := /bin/bash

# Will appear as directories under build/
BUILD_TARGETS = release dev dev-cli release-cli

# Can be overridden on the command line. This is the name of the tar.gz file
# produced when you run `make dist'.
DIST_NAME = $(shell echo "Doppio_`date +'%y-%m-%d'`.tar.gz")

# DEPENDENCIES
DOPPIO_DIR    := $(CURDIR)

IS_CYGWIN := $(shell if [[ `uname -s` == CYGWIN* ]]; then echo 1; else echo 0; fi)

# CYGWIN WRAPPERS
# In Cygwin, we have to run these commands on the Windows side of things.
ifeq (1,$(IS_CYGWIN))
	# This needs to be a relative path for Java to understand it; Java operating
	# in Cygwin doesn't understand Cygwin paths.
	BOOTCLASSPATH := $(shell realpath --relative-to=. $(DOPPIO_DIR)/vendor/classes)
	# Helper functions
	# Need to make a directory junction instead of a symlink.
	# Link name goes first.
	sym_link = cmd /c mklink /J `cygpath -w $(2)` `cygpath -w $(1)`
	# Node
	NODE     := cmd /c node
	NPM      := cmd /c npm
	NPM_BIN  := $(shell cmd /c npm bin)
	# Node modules
	COFFEEC  := cmd /c "$(NPM_BIN)\coffee.cmd"
	TSC      := cmd /c "$(NPM_BIN)\tsc.cmd"
	UGLIFYJS := cmd /c "$(NPM_BIN)\uglifyjs.cmd"
	DOCCO    := cmd /c "$(NPM_BIN)\docco.cmd"
	BOWER    := cmd /c "$(NPM_BIN)\bower.cmd"
	ICE_CREAM := cmd /c "node $(NPM_BIN)\ice-cream.cmd"
	R_JS     := cmd /c "node $(NPM_BIN)\r.js.cmd"
	# Java
	# * Use command prompt to get the location of Program Files.
	# * Trim the carriage return, which messes up string concatenation in bash.
	# * Convert to Cygwin path, use find command to find JDK directory.
	_PF := $(shell cmd /c echo "%ProgramFiles%" | tr -d '\r')
	JDK_PATH := $(shell find "`cygpath \"$(_PF)\"`/Java" -name jdk1\.6\* | head -n 1)
	JAVA     := "$(JDK_PATH)/bin/java"
	JAVAC    := "$(JDK_PATH)/bin/javac"
	JAVAP    := "$(JDK_PATH)/bin/javap"
else
	BOOTCLASSPATH := $(DOPPIO_DIR)/vendor/classes
	# Helper functions
	sym_link = ln -sfn $(1) $(2)
	# Node
	NODE     := node
	NPM      := npm
	NPM_BIN  := $(shell npm bin)
	# Node modules
	COFFEEC  := $(NPM_BIN)/coffee
	TSC      := $(NPM_BIN)/tsc
	UGLIFYJS := $(NPM_BIN)/uglifyjs
	DOCCO    := $(NPM_BIN)/docco
	BOWER    := $(NPM_BIN)/bower
	ICE_CREAM := node $(NPM_BIN)/ice-cream
	R_JS     := $(NPM_BIN)/r.js
	# Java
	JAVA     := java
	JAVAC    := javac
	JAVAP    := javap
endif

JAZZLIB  := $(BOOTCLASSPATH)/java/util/zip/DeflaterEngine.class
JRE      := $(BOOTCLASSPATH)/java/lang/Object.class

# JAVA
SOURCES := $(wildcard classes/test/*.java)
DISASMS := $(SOURCES:.java=.disasm)
RUNOUTS := $(SOURCES:.java=.runout)
CLASSES := $(SOURCES:.java=.class)
# note: TESTS files never get made, but we use them for make rules
TESTS   := $(SOURCES:.java=.test)

DEMO_SRCS    := $(wildcard classes/demo/*.java)
DEMO_CLASSES := $(DEMO_SRCS:.java=.class)
UTIL_SRCS    := $(wildcard classes/util/*.java)
UTIL_CLASSES := $(UTIL_SRCS:.java=.class)
# native stubs for our own implementations
LIB_SRCS     := $(wildcard classes/awt/*.java) $(wildcard classes/doppio/*.java)
LIB_CLASSES  := $(LIB_SRCS:.java=.class)

# HTML
BROWSER_TEMPLATES := $(wildcard browser/[^_]*.mustache)
BROWSER_HTML      := $(BROWSER_TEMPLATES:.mustache=.html)

CLI_SRCS := $(wildcard src/*.ts console/*.ts)
BROWSER_SRCS := $(wildcard src/*.ts browser/*.ts)

################################################################################
# TARGETS
################################################################################
# Protect non-file-based targets from not functioning if a file with the
# target's name is present.
.PHONY: release benchmark dist dependencies java test clean docs build dev library
# Never delete these files in the event of a failure.
.SECONDARY: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES) $(UTIL_CLASSES)
# Make uses the first valid target as the default target. We place this here so
# we can neatly organize the dependencies below in groups without worrying about
# this detail.
default: library

clean:
	@rm -f tools/*.js tools/preload browser/listings.json doppio doppio-dev
	@rm -rf build/*
	@rm -f $(patsubst %.md,%.html,$(wildcard browser/*.md))

distclean: clean
	@rm -f $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES)

################################################################################
# PRE-REQUISITES
################################################################################
# Installs or checks for any required dependencies.
dependencies: $(JAZZLIB) $(JRE)
	@rm -f classes/test/failures.txt
	@$(NPM) install
	@$(BOWER) install
$(JAZZLIB):
	$(error JazzLib not found. Unzip it to $(BOOTCLASSPATH), or run ./tools/setup.sh.)
$(JRE):
	$(error Java class library not found. Unzip it to $(BOOTCLASSPATH), or run ./tools/setup.sh.)

# Used to test the chosen Java compiler in setup.sh.
java: $(CLASSES) $(DISASMS) $(RUNOUTS) $(DEMO_CLASSES) $(UTIL_CLASSES) $(LIB_CLASSES)

################################################################################
# TESTING
################################################################################
# Runs the Java tests in classes/test with the node runner.
test: dependencies $(TESTS)
	@echo ''
	@cat classes/test/failures.txt
	@! test -s classes/test/failures.txt # return 1 if file is nonempty
	@if [[ -s classes/test/xfail.txt ]]; then echo -n 'Expected failures: '; xargs <classes/test/xfail.txt; fi
# compiling each one by itself is really inefficient...
%.class: %.java
	$(JAVAC) -bootclasspath $(BOOTCLASSPATH) $^
# phony *.test targets allow us to test with -j4 parallelism
classes/test/%.test: release-cli classes/test/%.class classes/test/%.disasm classes/test/%.runout
	@$(NODE) build/release-cli/console/test_runner.js classes/test/$* --makefile
# The trim command is to handle the Windows case.
classes/test/%.disasm: classes/test/%.class
	$(JAVAP) -bootclasspath $(BOOTCLASSPATH) -c -verbose -private classes/test/$* >classes/test/$*.disasm
	@if [[ $(IS_CYGWIN) = 1 ]]; then dos2unix classes/test/$*.disasm; fi
# some tests may throw exceptions. The '-' flag tells make to carry on anyway.
classes/test/%.runout: classes/test/%.class
	-$(JAVA) -Xbootclasspath/a:$(BOOTCLASSPATH) classes/test/$* &>classes/test/$*.runout
	@if [[ $(IS_CYGWIN) = 1 && -e classes/test/$*.runout ]]; then dos2unix classes/test/$*.runout; fi

################################################################################
# BROWSER
################################################################################
library: dependencies build/release/doppio.js

# dev: unoptimized build
dev: dependencies build/dev/classes build/dev/vendor \
	build/dev/browser/frontend.js build/dev/browser/style.css \
	build/dev/index.html build/dev/favicon.ico $(DEMO_CLASSES) $(UTIL_CLASSES) \
	build/dev/browser/mini-rt.tar build/dev/browser/require_config.js

	rsync browser/*.svg browser/*.png build/dev/browser/
	rsync browser/core_viewer/core_viewer.css build/dev/browser/core_viewer/
	$(COFFEEC) -c -o build/dev/browser/core_viewer browser/core_viewer/core_viewer.coffee
	cp browser/core_viewer.html build/dev
	cd build/dev; $(COFFEEC) $(DOPPIO_DIR)/tools/gen_dir_listings.coffee > browser/listings.json

# Note that this one command compiles the entire development build.
build/dev/browser/frontend.js: $(BROWSER_SRCS) | build/dev/browser
	$(TSC) --module amd --declaration --outDir build/dev browser/frontend.ts

build/dev/browser/require_config.js: browser/require_config.js | build/dev/browser
	cp $^ $@

# Builds a release version of Doppio without the documentation.
release: dependencies build/release/classes build/release/vendor \
	$(patsubst %,build/release/%,$(notdir $(BROWSER_HTML))) \
	build/release/doppio.js build/release/browser/frontend.js \
	build/release/favicon.ico build/release/browser/mini-rt.tar \
	build/release/browser/style.css
	rsync browser/*.svg browser/*.png build/release/browser/
	cd build/release; $(COFFEEC) $(DOPPIO_DIR)/tools/gen_dir_listings.coffee > browser/listings.json

build/release/doppio.js: build/release dev
	$(R_JS) -o browser/build.js

build/release/browser/frontend.js: build/release/doppio.js dev build/release/browser
	$(R_JS) -o browser/build_frontend.js

# Builds a distributable version of Doppio.
dist: $(DIST_NAME)
$(DIST_NAME): release docs
	tar czf $(DIST_NAME) build/release

# docs need to be generated in one shot so docco can create the full jumplist.
# This is slow, so we have it as a separate target (even though it is needed
# for a full release build).
docs: dependencies build/release
	$(DOCCO) $(filter %.ts, $(release_BROWSER_SRCS))
	rm -rf build/release/docs
	mv docs build/release

tools/preload: release-cli
	@if [ -z "$$KEEP_PRELOAD" ] && [ -f tools/preload ]; then \
		echo "Are you sure you want to regenerate tools/preload? (y/n)"; \
		read answer; \
		if [ $$answer = "n" ]; then \
			KEEP_PRELOAD="true"; \
		fi \
	fi; \
	if [ -z "$$KEEP_PRELOAD" ]; then \
		echo "Generating list of files to preload in browser... (will take a few seconds)"; \
		./doppio -Xlist-class-cache classes/util/Javac ./classes/test/FileOps.java > tools/preload; \
		if [ -f tools/preload-compile-extras ]; then \
			cat tools/preload-compile-extras >> tools/preload; \
		fi; \
	else \
		echo "Not regenerating tools/preload because you told me so"; \
	fi

build/%/browser/mini-rt.tar: build/%/browser tools/preload
	COPYFILE_DISABLE=true && tar -c -T tools/preload -f $@

# The | prevents the prerequisite from being included in $^, and avoids
# re-executing the rule when the folder is 'updated' with `mkdir -p`.
build/%/browser/style.css: vendor/bootstrap/docs/assets/css/bootstrap.css \
	browser/style.css | build/%/browser
	cat $^ > $@

build/dev/%.html: build/dev browser/%.mustache browser/_navbar.mustache
	$(COFFEEC) browser/render.coffee $* > $@

# XXX: Not all HTML files depend on _about.md, but we need that dependency here
#      to appropriately regenerate about.html.
build/release/%.html: build/release browser/%.mustache browser/_navbar.mustache browser/_about.md
	$(COFFEEC) browser/render.coffee --release $* > $@

build/%/favicon.ico: browser/favicon.ico build/%
	rsync $< $@

################################################################################
# CLI
################################################################################
release-cli: $(CLI_SRCS:%.ts=build/release-cli/%.js) build/release-cli/classes \
	build/release-cli/vendor doppio
build/release-cli/%.js: %.ts | dev-cli build/release-cli build/release-cli/src build/release-cli/browser build/release-cli/console
	$(ICE_CREAM) build/dev-cli/$*.js --remove trace --remove vtrace --remove debug > $@
	$(UGLIFYJS) $@ -o $@ -c warnings=false -d UNSAFE=true,RELEASE=true --unsafe

dev-cli: build/dev-cli/console/runner.js build/dev-cli/classes build/dev-cli/vendor doppio-dev
build/dev-cli/console/runner.js: $(CLI_SRCS)
	$(TSC) --module commonjs --outDir build/dev-cli console/*.ts

doppio doppio-dev:
	echo "node \`dirname \$$0\`/build/$(if $(findstring dev,$@),dev-cli,release-cli)/console/runner.js \"\$$@\"" > $@
	chmod +x $@

################################################################################
# GENERIC BUILD DIRECTORY TARGETS
################################################################################

# subst: Use 'manual' substitution because we don't want this to be a pattern
# rule.  there are multiple targets that need to be individually fulfilled, but
# pattern rules assume they are all fulfilled in one shot.
BUILD_FOLDERS = build/% build/%/browser build/%/console build/%/src
$(foreach TARGET,$(BUILD_TARGETS),$(subst %,$(TARGET),$(BUILD_FOLDERS))):
	mkdir -p $@
	ln -s $(DOPPIO_DIR)/vendor $@/vendor

# Prevent this from being treated as pattern rule (because it has multiple targets)
$(foreach TARGET,$(BUILD_TARGETS),$(subst %,$(TARGET),build/%/classes build/%/vendor)): $(foreach TARGET,$(BUILD_TARGETS),$(subst %,$(TARGET),build/%))
	$(call sym_link,$(DOPPIO_DIR)/$(notdir $@),$@)
