/**
 * Top-level doppio interface. Exposed through the `doppio` global.
 */
import _java_cli = require('./java_cli');
import _testing = require('./testing');
import _JVM = require('./jvm');

export var testing: typeof _testing = _testing;
export var javaCli: typeof _java_cli = _java_cli;
export var JVM: typeof _JVM = _JVM;
