run: test_files
	for testfile in $(wildcard test/*.class); do \
		echo running $$testfile; \
		coffee console/runner.coffee $$testfile; \
	done

disasm: test_files test/.make_target_1

test/.make_target_1: test/*.class
	for testfile in $?; do \
		cls=$${testfile%.*}; \
		echo "Disassembling $$cls"; \
		javap -c -verbose $$cls > $$cls.disasm; \
	done
	touch test/.make_target_1

test_files: test/.make_target_0

test/.make_target_0: test/*.java
	javac $?
	touch test/.make_target_0

clean:
	rm test/.make_target_*
	rm test/*.disasm
