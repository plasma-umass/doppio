import fs = require('fs');
import path = require('path');
type DirTree = {[name: string]: DirTree};

function generateListings(dir: string, ignore: string[]): any {
  var symLinks: {[p: string]: number} = {}

  function rdSync(dpath: string, tree: DirTree, name: string): DirTree {
    var files = fs.readdirSync(dpath), i: number, file: string, fpath: string;
    for (i = 0; i < files.length; i++) {
      file = files[i];
      if (ignore.indexOf(file) === -1) {
        fpath = `${dpath}/${file}`;
        try {
          var lstat = fs.lstatSync(fpath);
          if (lstat.isSymbolicLink()) {
            var realdir = fs.readlinkSync(fpath);
            // Ignore if we've seen it before.
            if (symLinks[realdir]) {
              continue;
            } else {
              symLinks[realdir] = 1;
            }
          }

          var fstat = fs.statSync(fpath);
          if (fstat.isDirectory()) {
            tree[file] = {};
            rdSync(fpath, tree[file], file);
          } else {
            tree[file] = null;
          }
        } catch (e) {
          // Ignore and more on.
        }
      }
    }
    return tree;
  }

  return rdSync(dir, {}, '/');
}

function listings(grunt: IGrunt) {
  grunt.registerTask('listings', 'Generates listings.json', function(target: string) {
    let output = `build/${target}/listings.json`;
    let folder = `build/${target}`;
    // Dirty hack for now.
    if (target === 'examples') {
      output = "docs/examples/listings.json";
      folder = "docs/examples";
    }
    grunt.file.write(output, JSON.stringify(generateListings(folder, ['.git', 'node_modules'])));
  });
}

export = listings;
