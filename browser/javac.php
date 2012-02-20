<?php
// this gets us around Chrome's issues with AJAX requests from file://
header('Access-Control-Allow-Origin: *');

function my_die($msg) {
  header("HTTP/1.1 500 Internal Server Error");
  die($msg);
}

if (isset($_POST) && isset($_POST['source'])) {
  if ($_POST['pw'] != 'coffee') {
    my_die("Invalid password.");
  } else {
    preg_match('/(?:class|interface)\s+(\w+)/',$_POST['source'],$matches) or my_die("Couldn't parse a class name");
    $classname = $matches[1];
    $fh = fopen("$classname.java",'w') or my_die("Can't open '$classname.java' for writing");
    fwrite($fh, $_POST['source']);
    fclose($fh);
    $errors = shell_exec("javac $classname.java 2>&1");
    unlink("$classname.java");
    readfile("$classname.class") or my_die("Failed to compile class $classname:\n$errors");
    unlink("$classname.class");
  }
} else {
  echo "POST a 'source' java string to compile it.";
}

?>
