/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import child_process = require('child_process');
import fs = require('fs');

function listings(grunt: IGrunt) {
	grunt.registerMultiTask('listings', 'Generates listings.json', function() {
    var done: (status?: boolean) => void = this.async(),
        cwd = process.cwd(), target: string = this.target,
        cp = child_process.spawn('node', [cwd + '/node_modules/.bin/coffee', cwd + '/tools/gen_dir_listings.coffee'], {cwd: 'build/' + target}),
        file = fs.createWriteStream('build/' + target + '/browser/listings.json');
    cp.stdout.on('data', function(data: NodeBuffer) {
      file.write(data);
    });
    cp.on('close', function(code: number) {
      file.end();
      if (code !== 0) {
        grunt.fail.fatal('Error producing listings.json!');
      }
      done();
    });
  });
}

(module).exports = listings;
