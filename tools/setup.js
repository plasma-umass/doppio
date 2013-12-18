/*jslint node: true */
"use strict";
var fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    async, npm;

var DOWNLOAD_DIR,
    JAVA = 'java',
    JAVAC = 'javac',
    JAVAP = 'javap';

/**
 * Checks if the given module is available. If not, it installs it with npm.
 */
function check_install_module(name, cb) {
  // Check if it's present.
  try {
    require(name);
    cb();
  } catch (e) {
    exec('npm install name', cb);
  }
}

/**
 * Determines the path to JAVA_HOME, and updates the paths to JAVA/JAVAC/JAVAP.
 */
function find_java_home(cb) {
  var fail_msg = "Could not find a working version of Java 6. Please ensure " +
                 "that you have a version of Java 6 installed on your computer.",
      userCb = cb;
  console.log("Finding Java installation directory...");
  cb = function(err) {
    if (!err) {
      console.log("\tJava: " + JAVA);
      console.log("\tJavap: " + JAVAP);
      console.log("\tJavac: " + JAVAC);
    }
    userCb(err);
  };

  if (process.platform.match(/win32/i)) {
    // Windows
    // N.B.: We cannot include 'winreg' in package.json, as it fails to install
    //       on *nix environments. :(
    check_install_module('winreg', function(err) {
      if (err) return cb(err);
      var Winreg = require('winreg'), regKey;
      // Look up JDK path.
      regKey = new Winreg({
        key:  '\\SOFTWARE\\JavaSoft\\Java Runtime Environment\\1.6'
      });
      regKey.values(function(err, items) {
        var i, java_home;
        if (!err) {
          for (i in items) {
            if (items[i].name === 'JavaHome') {
              java_home = items[i].value;
              JAVA = path.resolve(java_home, 'bin\\java.exe');
              JAVAC = path.resolve(java_home, 'bin\\javac.exe');
              JAVAC = path.resolve(java_home, 'bin\\javap.exe');
              return cb();
            }
          }
        }
        // err won't contain any useful information; it'll say 'process ended
        // with code 1'. The end result is: No working java. :(
        cb(new Error(fail_msg));
      });
    });
  } else {
    // *nix / Mac
    // Option 1: Can we invoke 'java' directly?
    exec(JAVA, function(err, stdout, stderr) {
      var java_home;
      if (err) {
        // Option 2: Is JAVA_HOME defined?
        if (process.env.JAVA_HOME) {
          java_home = process.env.JAVA_HOME;
          JAVA = path.resolve(java_home, 'bin/java');
          JAVAC = path.resolve(java_home, 'bin/javac');
          JAVAC = path.resolve(java_home, 'bin/javap');
        } else {
          // Java can't be found.
          cb(new Error(fail_msg));
        }
      } else {
        // 'java' is OK.
        cb();
      }
    });
  }
}

function jcl_download(cb) {
  console.log('Downloading the Java class library (big download, may take a while)');
  process.chdir('vendor');
  // Ubuntu (security) repo actual on 24.02.2013
  exec('mktemp -d jdk-download.XXX', function(err, stdout, stderr){
    DOWNLOAD_DIR = stdout.trim();
    process.chdir(DOWNLOAD_DIR);
    var DEBS_DOMAIN="http://security.ubuntu.com/ubuntu/pool/main/o/openjdk-6";
    var DEBS = [
        "openjdk-6-jre-headless_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jdk_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jre-lib_6b27-1.12.6-1ubuntu0.12.04.4_all.deb"
    ];
    var request = require('request');
    async.each(DEBS, function(deb, cb2){
      var url = DEBS_DOMAIN + '/' + deb;
      var file = fs.createWriteStream(deb);
      request(url).pipe(file);
      file.on('finish', function(){
        file.close();
        exec('ar p '+deb+' data.tar.gz | tar zx', function(err, stdout, stderr){
          return cb2(err);
        });
      });
    }, function(err){
      process.chdir('..');
      return cb(err);
    });
  });
}

function extract_jars(cb) {
  console.log('Extracting JAR files');
  var jars = ["rt.jar", "tools.jar", "resources.jar", "rhino.jar", "jsse.jar"];
  async.each(jars, function(jar, cb2){
    var cmd = 'find '+DOWNLOAD_DIR+'/usr -name '+jar+' | head -1';
    exec(cmd, function(err, stdout, stderr){
      var jar_path = stdout.trim();
      console.log('Extracting the Java class library from ' + jar_path);
      exec('unzip -qq -o -d classes/ "'+jar_path+'"', function(err, stdout, stderr){
        return cb2(err);
      });
    });
  }, function(err){
    return cb(err);
  });
}

function symlink_java_home(cb) {
  if (fs.existsSync('java_home')) {
    return cb(null);
  }
  console.log('Symlinking files into java_home');
  var JH = DOWNLOAD_DIR+'/usr/lib/jvm/java-6-openjdk-i386/jre';
  // a number of .properties files are symlinks to /etc; copy the targets over
  // so we do not need to depend on /etc's existence
  exec('find '+JH+' -type l', function(err, stdout, stderr){
    if (err !== null) return cb(err);
    var links = stdout.split(/\r?\n/g);
    async.each(links, function(link, cb2){
      if (link.trim().length === 0) return cb2(null);
      var dest = fs.readlinkSync(link);
      if (dest.match(/^\/etc/)) {
        try {
          fs.renameSync(path.join(DOWNLOAD_DIR, dest), link);
        } catch (e) {
          // Some /etc symlinks are just broken. Hopefully not a big deal.
          console.log('warning: broken symlink: '+dest);
        }
      } else {
        var p = path.resolve(path.join(path.dirname(link), dest));
        // copy in anything that links out of the JH dir
        if (!p.match(/java-6-openjdk-i386/)) {
          // XXX: this fails if two symlinks reference the same file
          try {
          if (fs.statSync(p).isDirectory()) {
            fs.unlinkSync(link);
            fs.renameSync(p, link);
          } else {
            fs.renameSync(p, link);
          }
        } catch (e) {
          console.log('warning: broken symlink: '+p);
        }
      }
      }
      cb2(null);
    }, function(err){
      fs.renameSync(JH, 'java_home');
      return cb(err);
    });
  });
}

function jcl_setup(cb) {
  // check for the JCL
  if (fs.existsSync('vendor/classes/java/lang/Object.class')) {
    return cb(null);
  }
  async.series([
    jcl_download,
    extract_jars,
    symlink_java_home
  ], function(err){
    if (err !== null) return cb(err);
    var rimraf = require('rimraf');
    rimraf(DOWNLOAD_DIR, function(err){
      process.chdir('..');  // back out of vendor/
      return cb(err);
    });
  });
}

function get_ecj(cb) {
  /* Download Eclipse standalone compiler
     Example uses:
       java -classpath vendor/classes org.eclipse.jdt.internal.compiler.batch.Main A.java
     With Doppio: (see issue #218)
       ./doppio -Djdt.compiler.useSingleThread -jar vendor/jars/ecj.jar -1.6 classes/demo/Fib.java
  */
  var ecj_pathname = 'vendor/jars/ecj.jar';
  if (fs.existsSync(ecj_pathname)) return cb(null);
  console.log('Downloading the ECJ compiler.');
  var ecj_url = "http://www.eclipse.org/downloads/download.php?file=/eclipse/downloads/drops/R-3.7.1-201109091335/ecj-3.7.1.jar";
  if (!fs.existsSync('vendor/jars')) fs.mkdirSync('vendor/jars');
  var ecj_file = fs.createWriteStream(ecj_pathname);
  var request = require('request');
  request(ecj_url).pipe(ecj_file);
  ecj_file.on('finish', function(){
    ecj_file.close();
    // TODO: use node-zip here, instead of exec
    exec('unzip -qq -o -d vendor/classes/ '+ecj_pathname, function(err, stdout, stderr){
      return cb(err);
    });
  });
}

function patch_jazzlib(cb) {
  // check for jazzlib
  if (fs.existsSync('vendor/classes/java/util/zip/DeflaterEngine.class')) return cb(null);
  console.log("patching the class library with Jazzlib");
  if (!fs.existsSync('jazzlib')) fs.mkdirSync('jazzlib');
  var url = "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip";
  var jazzlib_file = fs.createWriteStream('jazzlib/jazzlib.zip');
  var request = require('request');
  request(url).pipe(jazzlib_file);
  jazzlib_file.on('finish', function(){
    jazzlib_file.close();
    // TODO: use node-zip here, instead of exec
    exec('unzip -qq jazzlib/jazzlib.zip -d jazzlib/', function(err, stdout, stderr){
      if (err!==null) return cb(err);
      var zipfiles = fs.readdirSync('jazzlib/java/util/zip');
      async.each(zipfiles, function(fname, cb2){
        if (!fname.match(/\.class$/)) return cb2(null);
        fs.rename(path.join('jazzlib/java/util/zip', fname),
                  path.join('vendor/classes/java/util/zip', fname),
                  cb2);
      }, function(err){
        if (err!==null) return cb(err);
        require('rimraf')('jazzlib', function(err){
          cb(err);
        });
      });
    });
  });
}

function update_npm_packages(cb) {
  npm.load(function(err, npm){
    if (err !== null) return cb(err);
    console.log("Installing required node modules");
    npm.install(function(err){
      return cb(err);
    });
  });
}

function update_bower_packages(cb) {
  console.log("Installing frontend dependencies");
  require('bower').commands.install()
  .on('end', function(){
    cb(null);
  })
  .on('error', function(err){
    cb(err);
  });
}

function check_node_version(cb) {
  console.log('Checking node version...');
  if (require('semver').lt(process.versions.node, '0.10.0')) {
    console.log('\tnode >= v0.10.0 required, please update.');
    cb(true);
  }
  console.log('\tOK.');
  cb(null);
}

function check_java_version(cb) {
  console.log('Checking java version...');
  exec(JAVAC+' -version', function(err, stdout, stderr){
    if (stderr.match(/1\.7/)) {
      console.log('Detected Java 7 (via javac). Please use Java 6.');
      return cb(true);
    }
    console.log('\tOK.');
    cb(null);
  });
}

function make_java(cb) {
  console.log('Generating Java classfiles');
  exec('make java', function(err, stdout, stderr){
    cb(err);
  });
}

function main() {
  process.chdir(__dirname + '/..');
  async.series([
    find_java_home,
    check_java_version,
    update_npm_packages,
    check_node_version,
    update_bower_packages,
    jcl_setup,
    get_ecj,
    patch_jazzlib,
    make_java
  ], function(err){
    if (err!==null) {
      console.error(err);
    } else {
      console.log('Your environment should now be set up correctly.');
      console.log("Run 'make test' (optionally with -j4) to test Doppio.");
    }
  });
}

// Ensure that the async and npm modules are loaded.
var needs_bootstrap = false;
try {
  async = require('async');
  npm = require('npm');
} catch (err) {
  needs_bootstrap = true;
  var cmd = 'npm install async npm';
  if (process.platform.match(/CYGWIN/i)) {
    cmd = 'cmd /c ' + cmd;
  }
  console.log('Bootstrapping required modules: async, npm');
  exec(cmd, function(err, stdout, stderr){
    if (err!==null) {
      console.error(err);
      console.error("Couldn't install required npm modules: async, npm");
      process.exit(1);
    } else {
      async = require('async');
      npm = require('npm');
      main();
    }
  });
}
if (!needs_bootstrap) {
  main();
}
