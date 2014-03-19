require.config({
  shim: {
    'vendor/underscore/underscore': {
      exports: '_'
    },
    'vendor/jquery/dist/jquery.min': {
      exports: '$'
    },
    'vendor/jquery-migrate/jquery-migrate.min': {
      deps: ['vendor/jquery/dist/jquery.min']
    },
    'vendor/jquery.console': {
      deps: ['vendor/jquery/dist/jquery.min']
    }
  },
  paths: {
    fs: 'browser/fs',
    path: 'browser/path'
  }
});
