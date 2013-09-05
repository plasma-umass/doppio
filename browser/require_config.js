require.config({
  shim: {
    'vendor/underscore/underscore': {
      exports: '_'
    },
    'vendor/jquery/jquery.min': {
      exports: '$'
    },
    'vendor/jquery-migrate/jquery-migrate.min': {
      deps: ['vendor/jquery/jquery.min']
    },
    'vendor/jquery.console': {
      deps: ['vendor/jquery/jquery.min']
    },
    'vendor/ace-builds/src/ace': {
    },
    'vendor/ace-builds/src/mode-java': {
      deps: ['vendor/ace-builds/src/ace']
    },
    'vendor/ace-builds/src/theme-twilight': {
      deps: ['vendor/ace-builds/src/ace']
    }
  },
  paths: {
    // underscore is rolled into doppio
    "vendor/underscore/underscore": "doppio",
    // RequireJS doesn't allow us to map a directory to a single file, so we
    // have to explicitly list each here.
    "src/attributes": "doppio",
    "src/ClassData": "doppio",
    "src/ClassLoader": "doppio",
    "src/ConstantPool": "doppio",
    "src/disassembler": "doppio",
    "src/exceptions": "doppio",
    "src/gLong": "doppio",
    "src/java_object": "doppio",
    "src/jvm": "doppio",
    "src/logging": "doppio",
    "src/methods": "doppio",
    "src/natives": "doppio",
    "src/opcodes": "doppio",
    "src/option_parser": "doppio",
    "src/runtime": "doppio",
    "src/testing": "doppio",
    "src/util": "doppio"
  }
});
