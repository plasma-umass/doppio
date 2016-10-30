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
  });
