/**
 * Top-level doppio interface. Exposed through the `doppio` global.
 */
import _java_cli = require('./java_cli');
import _disassembler = require('./disassembler');
import _testing = require('./testing');
import _JVM = require('./jvm');

export var testing: typeof _testing = _testing;
export var disassembler: typeof _disassembler = _disassembler;
export var java_cli: typeof _java_cli = _java_cli;
export var JVM: typeof _JVM = _JVM;
