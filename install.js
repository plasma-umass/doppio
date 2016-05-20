var path = require('path'),
  fs = require('fs'),
  child_process = require('child_process');

// Circumvent if occurring in a dev environment.
if (fs.existsSync(path.resolve(__dirname, '.git')) && process.argv.indexOf("force") === -1) {
  process.exit(0);
}

function checkCode(code) {
  if (code != 0) {
    throw new Error("Program exited with code " + code);
  }
}

var options = {
  stdio: 'inherit'
}

// Download JDK, symlink into /dist.
child_process.spawn('node', [path.resolve(__dirname, "dist/dev-cli/console/download_jdk.js")], options)
  .on('close', function(code) {
    checkCode(code);
    // Copy distributed doppio.jar into /vendor
    fs.writeFileSync(path.resolve(__dirname, 'vendor/java_home/lib/doppio.jar'), fs.readFileSync(path.resolve(__dirname, 'dist', 'doppio.jar')));
    ['dev', 'release', 'fast-dev'].forEach(function(buildType) {
      ['-cli', ''].forEach(function(buildTarget) {
        fs.symlinkSync(path.resolve(__dirname, 'vendor'), path.resolve(__dirname, 'dist/' + buildType + buildTarget + '/vendor'), 'junction');
      });
    });
  });