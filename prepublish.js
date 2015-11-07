// Handles prepublishing things for cross-platform reasons.
var path = require('path'),
  fs = require('fs'),
  child_process = require('child_process');

// Circumvent on Travis-CI.
if (process.env['TRAVIS']) {
  process.exit(0);
}

function checkCode(code) {
  if (code != 0) {
    throw new Error("Program exited with code " + code);
  }
}

function getNodeBinItem(name) {
  return path.resolve(".", "node_modules", ".bin", name + (process.platform === "win32" ? ".cmd" : ""));
}

var options = {
  stdio: 'inherit'
}

function makeBinScript(name, target) {
  var relPath = path.relative('bin', target);
  // Node modules use unix dir separators.
  relPath = relPath.replace(/\\/g, "/");
  fs.writeFileSync(path.resolve('bin', name),
    new Buffer("#!/usr/bin/env node\nrequire('" + relPath + "');\n", "utf8"), {
    mode: 493
  });
}

child_process.spawn(getNodeBinItem('grunt'), ["dist", "--grunt-ignore-compile-errors"], options)
  .on('close', function(code) {
    checkCode(code);
    try {
      fs.mkdirSync('bin');
    } catch (e) {
      if (e.code !== 'EEXIST') {
        throw e;
      }
    }
    makeBinScript("doppio", "dist/release-cli/console/runner");
    makeBinScript("doppioh", "dist/release-cli/console/doppioh");
    makeBinScript("doppio-dev", "dist/dev-cli/console/runner");
    makeBinScript("doppio-fast-dev", "dist/fast-dev-cli/console/runner");
  });
