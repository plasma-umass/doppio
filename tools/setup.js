/*jslint node: true */
"use strict";
var fs = require('fs'),
    path = require('path'),
    os = require('os'),
    zlib = require('zlib'),
    exec = require('child_process').exec,
    ar = require('ar'),
    tar = require('tar'),
    request = require('request'),
    semver = require('semver'),
    rimraf = require('rimraf'),
    AdmZip = require('adm-zip'),
    async = require('async');

var JAVA = 'java',
    JAVAC = 'javac',
    JAVAP = 'javap',
    // Ubuntu (security) repo actual on 24.02.2013
    DEBS_DOMAIN="http://security.ubuntu.com/ubuntu/pool/main/o/openjdk-6",
    DEBS = [
        "openjdk-6-jre-headless_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jdk_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jre-lib_6b27-1.12.6-1ubuntu0.12.04.4_all.deb"
    ],
    DOWNLOAD_DIR = path.resolve(os.tmpdir(), "jdk-download" + Math.floor(Math.random()*100000)),
    RUN_DIR = path.resolve(__dirname, '..'),
    VENDOR_DIR = path.resolve(RUN_DIR, 'vendor'),
    CLASSES_DIR = path.resolve(VENDOR_DIR, 'classes');

/**
 * Unzips the file at file_path to dest_dir.
 */
function unzip(file_path, dest_dir, cb) {
  var err;
  try {
    var zip = new AdmZip(file_path);
    zip.extractAllTo(/*target path*/dest_dir, /*overwrite*/true);
  } catch (e) {
    err = e;
  }
  cb(err);
}

/**
 * Checks if the given module is available. If not, it installs it with npm.
 */
function check_install_module(name, cb) {
  // Check if it's present.
  try {
    require(name);
    cb();
  } catch (e) {
    exec('npm install ' + name, cb);
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
        var i, java_bin;
        if (!err) {
          for (i in items) {
            if (items[i].name === 'JavaHome') {
              java_bin = path.resolve(items[i].value, 'bin');
              JAVA = path.resolve(java_bin, 'java.exe');
              JAVAC = path.resolve(java_bin, 'javac.exe');
              JAVAC = path.resolve(java_bin, 'javap.exe');
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
      var java_bin;
      if (err) {
        // Option 2: Is JAVA_HOME defined?
        if (process.env.JAVA_HOME) {
          java_bin = path.resolve(process.env.JAVA_HOME, 'bin');
          JAVA = path.resolve(java_bin, 'java');
          JAVAC = path.resolve(java_bin, 'javac');
          JAVAC = path.resolve(java_bin, 'javap');
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

/**
 * Finds data.tar.gz in the given debian package, and extracts it. Calls the
 * callback with an optional error message when finished.
 */
function extract_data(deb_path, cb) {
  var archive = new ar.Archive(fs.readFileSync(deb_path)),
      files = archive.getFiles(), i, file,
      found = false, tarFile = deb_path + ".tar", stream,
      stream_finish_cb = function(err) {
        // Close the stream before passing the callback.
        stream.close();
        cb(err);
      };

  // Iterate through the files to find data.tar.gz.
  for (i = 0; i < files.length; i++) {
    file = files[i];
    if (file.name() === 'data.tar.gz') {
      found = true;
      break;
    }
  }

  if (found) {
    // Decompress the file.
    zlib.gunzip(file.fileData(), function(err, buff) {
      if (err) return cb(err);
      // Write the tar file to disc so we can create a read stream for it.
      // There's no built-in way to create a stream from a buffer in Node.
      fs.writeFileSync(tarFile, buff);
      // Extract the tar file.
      stream = fs.createReadStream(tarFile);
      stream.pipe(tar.Extract({ path: DOWNLOAD_DIR })).on("error", stream_finish_cb).on("end", stream_finish_cb);
    });
  } else {
    cb(new Error("Could not find data.tar.gz in " + deb_path + "."));
  }
}

function jcl_download(cb) {
  console.log('Downloading the Java class library (big download, may take a while)');
  async.each(DEBS, function(deb, cb2){
    var url = DEBS_DOMAIN + '/' + deb,
        deb_path = path.resolve(DOWNLOAD_DIR, deb),
        file = fs.createWriteStream(deb_path);
    request(url).pipe(file);
    file.on('finish', function() {
      file.close();
      extract_data(deb_path, cb2);
    });
  }, cb);
}

/**
 * Looks for a file with the given name recursively in `path`.
 * Returns NULL if the file cannot be found.
 */
function find_file(dir, file) {
  var files = fs.readdirSync(dir),
      i = 0, filePath, rv;
  if (files.indexOf(file) !== -1) {
    return path.resolve(dir, file);
  } else {
    // Recurse into all subdirectories.
    for (i = 0; i < files.length; i++) {
      filePath = path.resolve(dir, files[i]);
      // lstatSync, since some symbolic links link to nonexistent locations.
      if (fs.lstatSync(filePath).isDirectory()) {
        rv = find_file(filePath, file);
        if (rv !== null) return rv;
      }
    }
  }
  return null;
}

function extract_jars(cb) {
  var jars = ["rt.jar", "tools.jar", "resources.jar", "rhino.jar", "jsse.jar"];
  console.log('Extracting JAR files');
  async.each(jars, function(jar, cb2){
    // Locate jar file.
    var jar_path = find_file(path.resolve(DOWNLOAD_DIR, 'usr'), jar);
    if (jar_path === null)
      return cb2(new Error("Could not find jar file " + jar + "."));
    console.log('Extracting the Java class library from ' + jar_path);
    unzip(jar_path, CLASSES_DIR, cb2);
  }, cb);
}

/**
 * (Helper function) Found is an array of symlinks found thus far. We simply
 * append to it.
 */
function _find_symlinks(dir, found) {
  var files = fs.readdirSync(dir), i, filePath, stat;
  // TODO: There's probably a better way to detect symlinks than this.
  for (i = 0; i < files.length; i++) {
    filePath = path.resolve(dir, files[i]);
    try {
      fs.readlinkSync(filePath);
      // It's a symbolic link.
      found.push(filePath);
    } catch (e) {
      // Not a symbolic link.
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Recurse.
        _find_symlinks(filePath, found);
      }
    }
  }
  return found;
}

/**
 * Recursively searches the given directory for symlinks. Returns an array of
 * found symlinks.
 */
function find_symlinks(dir) {
  return _find_symlinks(dir, []);
}

function symlink_java_home(cb) {
  var java_home = path.resolve(VENDOR_DIR, 'java_home'),
      JH = path.resolve(DOWNLOAD_DIR, 'usr', 'lib', 'jvm', 'java-6-openjdk-i386', 'jre'),
      links;
  if (fs.existsSync(java_home)) {
    return cb();
  }
  console.log('Symlinking files into java_home');
  // a number of .properties files are symlinks to /etc; copy the targets over
  // so we do not need to depend on /etc's existence
  links = find_symlinks(JH);
  async.each(links, function(link, cb2){
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
          }
          fs.renameSync(p, link);
        } catch (e) {
          console.log('warning: broken symlink: '+p);
        }
      }
    }
    cb2(null);
  }, function(err){
    fs.renameSync(JH, java_home);
    return cb(err);
  });
}

function jcl_setup(cb) {
  // check for the JCL
  if (fs.existsSync(path.resolve(CLASSES_DIR, 'java', 'lang', 'Object.class'))) {
    return cb(null);
  }
  async.series([
    jcl_download,
    extract_jars,
    symlink_java_home
  ], cb);
}

function get_ecj(cb) {
  /* Download Eclipse standalone compiler
     Example uses:
       java -classpath vendor/classes org.eclipse.jdt.internal.compiler.batch.Main A.java
     With Doppio: (see issue #218)
       ./doppio -Djdt.compiler.useSingleThread -jar vendor/jars/ecj.jar -1.6 classes/demo/Fib.java
  */
  var ecj_mainclass = path.resolve(CLASSES_DIR, 'org', 'eclipse', 'jdt', 'internal', 'compiler', 'batch', 'Main.class'),
      ecj_url = "http://www.eclipse.org/downloads/download.php?file=/eclipse/downloads/drops/R-3.7.1-201109091335/ecj-3.7.1.jar",
      ecj_jar_path = path.resolve(DOWNLOAD_DIR, "ecj.jar"),
      ecj_stream = fs.createWriteStream(ecj_jar_path);
  if (fs.existsSync(ecj_mainclass)) return cb(null);
  console.log('Downloading the ECJ compiler.');
  request(ecj_url).pipe(ecj_stream).on('finish', function(err) {
    // close stream.
    ecj_stream.close();
    if (err) return cb(err);
    unzip(ecj_jar_path, CLASSES_DIR, cb);
  });
}

function patch_jazzlib(cb) {
  var jazzlib_dir = path.resolve(DOWNLOAD_DIR, 'jazzlib'),
      jazzlib_zipfile = path.resolve(DOWNLOAD_DIR, 'jazzlib.zip'),
      jazzlib_zipfile_stream,
      url = "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip";
  // check for jazzlib
  if (fs.existsSync(path.resolve(CLASSES_DIR, 'java', 'util', 'zip', 'DeflaterEngine.class'))) return cb(null);
  console.log("patching the class library with Jazzlib");
  if (!fs.existsSync(jazzlib_dir)) fs.mkdirSync(jazzlib_dir);
  jazzlib_zipfile_stream = fs.createWriteStream(jazzlib_zipfile);
  // Download
  request(url).pipe(jazzlib_zipfile_stream).on('finish', function(err) {
    jazzlib_zipfile_stream.close();
    if (err) return cb(err);
    // Unzip
    unzip(jazzlib_zipfile, jazzlib_dir, function(err) {
      // Replace JCL zip classes.
      var jazzlib_zip_dir = path.resolve(jazzlib_dir, 'java', 'util', 'zip'),
        jcl_zip_dir = path.resolve(VENDOR_DIR, 'classes', 'java', 'util', 'zip'),
        zipfiles = fs.readdirSync(jazzlib_zip_dir);
      if (err) return cb(err);
      async.each(zipfiles, function(fname, cb2){
        if (!fname.match(/\.class$/)) return cb2(null);
        fs.rename(path.join(jazzlib_zip_dir, fname),
                  path.join(jcl_zip_dir, fname),
                  cb2);
      }, cb);
    });
  });
}

function check_node_version(cb) {
  console.log('Checking node version...');
  if (semver.lt(process.versions.node, '0.10.0')) {
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

// We randomly generated the download directory. It shouldn't exist.
fs.mkdirSync(DOWNLOAD_DIR);
async.series([
  find_java_home,
  check_java_version,
  check_node_version,
  jcl_setup,
  get_ecj,
  patch_jazzlib,
  make_java,
  // Delete the temporary download directory.
  function(cb) { rimraf(DOWNLOAD_DIR, cb); }
], function(err) {
  if (err !== null) {
    console.error(err);
  } else {
    console.log('Your environment should now be set up correctly.');
    console.log("Run 'make test' (optionally with -j4) to test Doppio.");
  }
});
