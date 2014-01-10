/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import child_process = require('child_process');
import fs = require('fs');

function listings(grunt: IGrunt) {
	grunt.registerMultiTask('listings', 'Generates listings.json', function() {
    var done: (status?: boolean) => void = this.async(),
        cwd = process.cwd(), target: string = this.target;
    child_process.exec('node ' + cwd + '/node_modules/.bin/coffee ' + cwd + '/tools/gen_dir_listings.coffee', {cwd: 'build/' + target}, function(err?: any, stdout?: NodeBuffer) {
      if (err) {
        grunt.fail.fatal("Unable to generate listings: " + err);
      } else {
        fs.writeFileSync('build/' + target + '/browser/listings.json', stdout);
      }
      done();
    });
  });
}

(module).exports = listings;
