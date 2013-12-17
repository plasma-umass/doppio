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
    }
  },
  paths: {
    fs: 'browser/fs',
    path: 'browser/path'
  }
});
