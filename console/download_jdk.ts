/**
 * Downloads DoppioJVM's JDK into vendor/java_home.
 */
import fs = require('fs');
import path = require('path');
import url = require('url');
import https = require('https');
import rimraf = require('rimraf');
let gunzip: () => NodeJS.ReadWriteStream = require('gunzip-maybe');
let tarFs: {
  extract: (path: string) => NodeJS.WritableStream;
} = require('tar-fs');

const JDK_URL = "https://github.com/plasma-umass/doppio_jcl/releases/download/v3.0/java_home.tar.gz";
const JDK_PATH = path.resolve(__dirname, "..", "..", "..", "vendor");
const JDK_FOLDER = "java_home";

/**
 * Checks if the JDK is already downloaded and installed.
 */
function doesJDKExist(): boolean {
  let jdkInfoPath = path.resolve(JDK_PATH, JDK_FOLDER, "jdk.json");
  if (fs.existsSync(jdkInfoPath)) {
    try {
      let jdkInfo = JSON.parse(fs.readFileSync(jdkInfoPath).toString());
      return jdkInfo['url'] === JDK_URL;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function mkdirp(p: string) {
  p = path.resolve(p);
  if (!fs.existsSync(p)) {
    // Make parent first if it doesn't exist.
    mkdirp(path.dirname(p));
    fs.mkdirSync(p);
  }
}

/**
 * Downloads the JDK at JDK_URL into the destination path.
 * Creates the path if it doesn't exist.
 */
function downloadJDK(url: string, destPath: string, cb: (err?: Error) => void) {
  let ended = false;
  mkdirp(destPath);
  https.get(url, (res) => {
    if (res.statusCode === 302) {
      // Redirected.
      ended = true;
      downloadJDK(res.headers['location'], destPath, cb);
      return;
    }

    // Will be NaN if not given by server.
    let contentLength = parseInt(res.headers['content-length']);
    let progressBytes = 0;
    let startTime = new Date().getTime();

    function printStatus() {
      let percent = "??";
      if (!isNaN(contentLength)) {
        percent = ((progressBytes/contentLength)*100).toFixed(0);
      }
      let lastPrint = new Date().getTime();
      // bytes => kbytes
      let dlSoFar = progressBytes >> 10;
      let rate = dlSoFar / ((lastPrint - startTime) / 1000);
      console.log(`[${percent}%] Received ${dlSoFar} KB [${rate.toFixed(2)} KB/s]`);
    }

    let interval = setInterval(function() {
      printStatus();
    }, 5000);

    function end(err?: Error) {
      if (!ended) {
        ended = true;
        clearInterval(interval);
        cb(err);
      }
    }

    res.pipe(gunzip()).pipe(tarFs.extract(destPath)).on('error', end).on('finish', end);
    res.on('data', (d: Buffer) => {
      progressBytes += d.length;
    });
  }).on('error', (err: Error) => {
    if (!ended) {
      ended = true;
      cb(err);
    }
  });
}

if (!doesJDKExist()) {
  console.log("JDK is out of date! Removing old JDK...");
  rimraf(path.resolve(JDK_PATH, JDK_FOLDER), (err: Error) => {
    if (err) {
      console.error(`Error removing old JDK: ${err}`);
      process.exit(1);
    }
    console.log("Downloading new JDK...");
    downloadJDK(JDK_URL, JDK_PATH, function(err?: Error) {
      if (err) {
        console.error(`Failed to download JDK: ${err}.`)
      } else {
        console.log(`Successfully downloaded JDK.`);
        fs.writeFileSync(path.resolve(JDK_PATH, JDK_FOLDER, "jdk.json"),
          new Buffer(`{ "url": "${JDK_URL}" }`, "utf8"));
      }
      process.exit(err ? 1 : 0);
    });
  });
} else {
  console.log("JDK is up-to-date.");
}
