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

function platform_setup(cb) {
  if (!process.platform.match(/CYGWIN/i)) return cb(null);
  exec('cmd /c echo "%ProgramFiles%" | tr -d "\r"', function (err, stdout, stderr){
    var cmd = 'find "`cygpath \\"' + stdout.trim() + '\\"`/Java" -name jdk1\\.6\\* | head -n 1';
    if (err !== null) return cb(err);
    exec(cmd, function(err, stdout, stderr){
      var JDK_PATH = stdout.trim();
      // No need to cmd /c; Java seems to work OK in Cygwin.
      // We use 'eval' because of the space in the Program Files directory.
      JAVA='eval "'+JDK_PATH+'/bin/java.exe"';
      JAVAC='eval "'+JDK_PATH+'/bin/javac.exe"';
      JAVAP='eval "'+JDK_PATH+'/bin/javap.exe"';
      return cb(err);
    });
  });
}

function jcl_download(cb) {
  console.log('Downloading the Java class library');
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
  var JH = DOWNLOAD_DIR+'/usr/lib/jvm/java-6-openjdk-common/jre';
  // a number of .properties files are symlinks to /etc; copy the targets over
  // so we do not need to depend on /etc's existence
  exec('find '+JH+' -type l', function(err, stdout, stderr){
    if (err !== null) return cb(err);
    var links = stdout.split(/\r?\n/g);
    async.each(links, function(link, cb2){
      var dest = fs.readlinkSync(link);
      if (dest.match(/^\/etc/)) {
        fs.renameSync(path.join(DOWNLOAD_DIR, dest), link);
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
      for (var fname in fs.readdirSync('jazzlib/java/util/zip')) {
        if (!fname.match(/\.class$/)) continue;
        fs.renameSync(path.join('jazzlib/java/util/zip', fname),
                      path.join('vendor/classes/java/util/zip', fname));
      }
      require('rimraf')('jazzlib', function(err){
        cb(err);
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
    console.log('node >= v0.10.0 required, please update.');
    cb(true);
  }
  console.log('OK.');
  cb(null);
}

function check_java_version(cb) {
  console.log('Checking java version...');
  exec(JAVAC+' -version', function(err, stdout, stderr){
    if (stderr.match(/1\.7/)) {
      console.log('Detected Java 7 (via javac). Please use Java 6.');
      return cb(true);
    }
    console.log('OK.');
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
    platform_setup,
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
