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
    // all of doppio's source is in the doppio library
    "src": "doppio"
  }
});
