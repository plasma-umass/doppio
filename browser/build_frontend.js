// Configuration file for RequireJS's optimizer.
({
    baseUrl: '../build/dev',
    name: 'browser/frontend',
    out: '../build/release/browser/frontend.js',
    mainConfigFile: 'require_config.js',
    // Don't try to bundle any of the Doppio library sources.
    exclude: ['src/attributes', 'src/ClassData', 'src/ClassLoader', 'src/ConstantPool', 'src/disassembler', 'src/exceptions', 'src/gLong', 'src/java_object', 'src/jvm', 'src/logging', 'src/methods', 'src/natives', 'src/opcodes', 'src/runtime', 'src/testing', 'src/util', 'vendor/underscore/underscore']
})
