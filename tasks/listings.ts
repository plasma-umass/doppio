/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import fs = require('fs');

function listings(grunt: IGrunt) {
	grunt.registerMultiTask('listings', 'Generates listings.json', function() {
    var done: (status?: boolean) => void = this.async(),
      cwd = process.cwd(),
      options = this.options();
    grunt.util.spawn({
      cmd: 'node',
      args: [cwd + '/node_modules/coffee-script/bin/coffee', cwd + '/tools/gen_dir_listings.coffee'],
      opts: {cwd: options.cwd}
    }, function(error: Error, result: grunt.util.ISpawnResult, code: number) {
      if (code !== 0 || error) {
        grunt.fail.fatal("Error generating listings.json: " + result.stderr + error);
      }
      fs.writeFileSync(options.output, result.stdout);
      done();
    });
  });
}

export = listings;
