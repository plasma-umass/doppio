/**
 * From https://stackoverflow.com/questions/7931182/reliably-detect-if-the-script-is-executing-in-a-web-worker
 */
function isWebWorker(): boolean {
  return self.document === undefined;
}
let outputDiv: HTMLTextAreaElement;
if (isWebWorker()) {
  importScripts('/node_modules/browserfs/dist/browserfs.js');
} else {
  window.addEventListener('load', function() {
    outputDiv = document.createElement('textarea');
    outputDiv.setAttribute('cols', '80');
    outputDiv.setAttribute('rows', '30');
    document.body.appendChild(outputDiv);
  });
}

const benchmarks = require('../../vendor/benchmarks/benchmarks.json');
import * as Doppio from '../../src/doppiojvm';
import * as BrowserFS from 'browserfs';
import * as async from 'async';
import * as path from 'path';
import * as fs from 'fs';
// Rename from process to prevent Webpack from inserting a process global.
// Causes problems in the webworker.
const process2 = BrowserFS.BFSRequire('process');
const browser = require('detect-browser');

function log(msg: string): void {
  if (isWebWorker()) {
    (<any> postMessage)({
      msg: msg
    });
  } else {
    outputDiv.value += msg + "\n";
  }
}

/**
 * Set up BrowserFS.
 */
function configureFS(): void {
  const xhr = new BrowserFS.FileSystem.XmlHttpRequest('listings.json', isWebWorker() ? '.' : `build/benchmark`),
    mfs = new BrowserFS.FileSystem.MountableFileSystem();
  mfs.mount('/sys', xhr);
  mfs.mkdirSync('/tmp', 0x1ff);
  BrowserFS.initialize(mfs);
}
configureFS();

function runBenchmarks(intOnly: boolean, cb: (e?: Error) => void): void {
  log(`>>> Running Benchmarks (JIT: ${intOnly ? 'off' : 'on'}, Context: ${isWebWorker() ? 'WebWorker' : 'Main Context'}, ${browser.name} ${browser.version}) <<<`);
  process2.chdir('/sys');
  const benchmarkNames = Object.keys(benchmarks);
  const curdir = process2.cwd();
  const bmDir = path.resolve('vendor/benchmarks');
  const results: {[name: string]: number} = {};
  async.eachSeries(benchmarkNames, (benchmarkName: string, done: (e?: Error) => void) => {
    log(benchmarkName);
    const bm = benchmarks[benchmarkName];
    process2.chdir(bmDir);
    if (bm.cwd) {
      process2.chdir(bm.cwd);
    }
    const start = performance.now();
    let args = bm.args;
    if (intOnly) {
      args = ["-Xint"].concat(args);
    }
    Doppio.VM.CLI(args, {
      launcherName: "java",
      doppioHomePath: "/sys"
    }, (code: number) => {
      if (code !== 0) {
        done(new Error("Benchmark failed."));
      } else {
        const end = performance.now();
        // Convert to ms.
        const timeMs = (end - start)|0;
        results[benchmarkName] = timeMs;
        log(`${timeMs} ms`);
        done();
      }
    });
  }, (err?: Error) => {
    process2.chdir(curdir);
    if (!err) {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/results/${intOnly ? 'doppio-int' : 'doppio'}-${browser.name}-${browser.version}${isWebWorker() ? '-ww' : ''}.json`);
      xhr.addEventListener('load', (ev) => {
        cb();
      });
      xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      xhr.send(JSON.stringify(results));
    } else {
      cb(err);
    }
  });
}

// Wait for page to load in non-ww context prior to triggering logs.
setTimeout(() => {
  runBenchmarks(false, (e) => {
    runBenchmarks(true, (e) => {
      if (!isWebWorker()) {
        const scripts = document.getElementsByTagName('script');
        let script: HTMLScriptElement = null;
        for (let i = 0; i < scripts.length; i++) {
          if (scripts[i].src.indexOf("benchmark_harness") !== -1) {
            script = scripts[i];
            break;
          }
        }
        if (script === null) {
          throw new Error(":(");
        }

        // Prevent it from getting GC'd. It will end everything.
        let bmWorker = new Worker(script.src);
        (<any> global).bmWorker = bmWorker;
        bmWorker.addEventListener('message', function(ev: MessageEvent) {
          log(ev.data.msg);
        });
      } else {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/done');
        xhr.send();
      }
    });
  });
}, 10);