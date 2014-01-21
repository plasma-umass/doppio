/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import fs = require('fs');
import run_command = require('./helpers/run_command');

function listings(grunt: IGrunt) {
	grunt.registerMultiTask('listings', 'Generates listings.json', function() {
    var done: (status?: boolean) => void = this.async(),
        cwd = process.cwd(),
        options = this.options(),
        stream = fs.createWriteStream(options.output),
        target_cwd = options.cwd;
    run_command.runCommand('node',
      [cwd + '/node_modules/coffee-script/bin/coffee', cwd + '/tools/gen_dir_listings.coffee'],
      {cwd: options.cwd},
      run_command.createWriteCb(stream), // stdout
      run_command.nopCb,                 // stderr
      run_command.createErrorCb(grunt, stream, done, // when program closes
        "Error generating listings.json!"))
  });
}

(module).exports = listings;
