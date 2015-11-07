package classes.test;

import java.io.*;
import java.util.Arrays;

class FileOps {
  static void printFile(File f) throws IOException {
    // Oh, Java... :/
    BufferedReader br = new BufferedReader(new FileReader(f));
    String s;
    while ((s = br.readLine()) != null)
      System.out.println(s);
    br.close();
  }
  public static void main(String[] args) throws IOException {
    String testDir = "./classes/test/data/FileOps";
    // I like scopes.
    {
      // This file does not exist.
      File f = new File("/dfsd/dsfds");
      try {
        BufferedReader reader = new BufferedReader(new FileReader(f));
      } catch (Exception e) {
        System.out.println("Successfully threw exception for nonexistent file.");
      }
    }
    {
      File f = new File("");
      System.out.println("Is '' an absolute path?: " + f.isAbsolute());
      {
        File fAbs = new File(f.getAbsolutePath());
        File fCanon = new File(f.getCanonicalPath());
        System.out.println("Does the absolute path of '' exist?: " + fAbs.exists());
        System.out.println("Does the canonical path of '' exist?: " + fCanon.exists());
        System.out.println("Does abspath == canonpath.abspath?: " + (fAbs.getAbsolutePath() == fCanon.getAbsolutePath()));
        System.out.println("Does abspath.canonpath == canonpath?: " + (fAbs.getCanonicalPath() == fCanon.getCanonicalPath()));
      }
      System.out.println("Does '' exist?: " + f.exists());
      System.out.println("What is the length of ''?: " + f.length());
      System.out.println("Can you write to ''?: " + f.canWrite());
    }

    File[] children = new File(testDir).listFiles();
    // Sort by name to avoid nondeterministic file orderings.
    Arrays.sort(children);
    for (File child : children) {
      System.out.println(child.getName());
    }

    {
      File f = new File(testDir + "/contains_data.txt");
      System.out.println("Does contains_data.txt exist?: " + f.exists());
      System.out.println("Length of contains_data.txt: " + f.length());
    }

    {
      File f = new File("/tmp");
      System.out.println("Is /tmp a directory?: " + f.isDirectory());
      System.out.println("Can I write to it?: " + f.canWrite());
    }

    {
      File f = new File( "/tmp/temp_delete_me.txt");
      System.out.println("Does temp_delete_me.txt exist?: " + f.exists());
      System.out.println("Did we successfully create this file?: " + f.createNewFile());
      System.out.println("And does it exist now?: " + f.exists());
      long lm = f.lastModified();
      System.out.println("Can I write to it?: " + f.canWrite());
      // BrowserFS doesn't implement chmod anymore for the temporary file system.
      // f.setWritable(false);
      // System.out.println("How about now?: " + f.canWrite());
      // f.setWritable(true);
      // System.out.println("And now?: " + f.canWrite());
      System.out.println("File size: " + f.length());
      // write over empty file
      FileWriter fw = new FileWriter(f);
      fw.write("Why, hello there!\n");
      fw.close();
      // mtime is platform-specific and not guaranteed to update
      f.setLastModified(System.currentTimeMillis()+1337);  // padding for fast execution
      System.out.println("Last modified updated?: " + (f.lastModified() > lm));
      System.out.println("New file size: " + f.length());
      System.out.println("File contents:");
      printFile(f);
      // append a line
      System.out.println("Appending to file's end...");
      fw = new FileWriter(f, true);
      fw.write("A second line?!\n");
      fw.close();
      System.out.println("File size: " + f.length());
      System.out.println("File contents:");
      printFile(f);
      // overwrite some text
      System.out.println("Overwriting some text...");
      RandomAccessFile raf = new RandomAccessFile(f, "rw");
      raf.skipBytes(17);
      raf.writeChars("KILROY WAS HERE\n");
      raf.close();
      System.out.println("File size: " + f.length());
      System.out.println("File contents:");
      printFile(f);
      System.out.println("Deleting file: " + f.delete());
      System.out.println("Does the file exist?: " + f.exists());
    }

    // Create and delete a directory.
    {
      File f = new File("/tmp/tempDir");
      System.out.println("Does tempDir exist?: " + f.exists());
      System.out.println("Making tempDir: " + f.mkdir());
      System.out.println("Does tempDir exist now?: " + f.exists());
      System.out.println("Deleting tempDir: " + f.delete());
      System.out.println("Does tempDir exist now?: " + f.exists());
    }
    {
      File f = new File("/tmp/tempDir/tempDir");
      File f2 = new File("/tmp/tempDir");
      System.out.println("Does tempDir/tempDir exist?: " + f.exists());
      System.out.println("Making tempDir/tempDir (should fail): " + f.mkdir());
      System.out.println("Does tempDir/tempDir exist now?: " + f.exists());
      System.out.println("Deleting tempDir/tempDir (should fail): " + f.delete());
      System.out.println("Making tempDir/tempDir (should succeed): " + f.mkdirs());
      System.out.println("Does tempDir/tempDir exist now?: " + f.exists());
      System.out.println("Deleting tempDir (should fail -- nonempty): " + f2.delete());
      System.out.println("Does tempDir/tempDir exist now?: " + f.exists());
      System.out.println("Does tempDir exist now?: " + f.exists());
      System.out.println("Deleting tempDir/tempDir: " + f.delete());
      System.out.println("Deleting tempDir (should succeed this time): " + f2.delete());
      System.out.println("Does tempDir/tempDir exist now?: " + f.exists());
      System.out.println("Does tempDir exist now?: " + f2.exists());
    }
    {
      File f = new File("/tmp");
      System.out.println("Trying to create a directory that already exists: " + f.mkdir());
    }

    // Rename a file.
    {
      File f = new File("/tmp/temp_rename_file.txt");
      File f2 = new File("/tmp/temp_rename_file2.txt");
      System.out.println("Creating temp_rename_file.txt: " + f.createNewFile());
      System.out.println("Renaming it to temp_rename_file2.txt: " + f.renameTo(f2));
      System.out.println("Old file exist? " + f.exists() + " New file exists? " + f2.exists());
      System.out.println("Recreating old file: " + f.createNewFile());
      System.out.println("Moving on top of old file: " + f2.renameTo(f));
      System.out.println("Deleting old file: " + f.delete());
      System.out.println("Trying to move nonexistant old file: " + f.renameTo(f2));
    }

    // Read only.
    {
      File f = new File("/tmp/temp_readonly.txt");
      System.out.println("Creating temp_readonly.txt: " + f.createNewFile());
      // BrowserFS doesn't support chmod in its temporary file system anymore.
      // System.out.println("Marking as read only: " + f.setReadOnly());
      System.out.println("Can I write to the file?: " + f.canWrite());
      System.out.println("Can I read the file?: " + f.canRead());
      // make sure we can open a read-only file with RandomAccessFile
      RandomAccessFile raf = new RandomAccessFile(f, "r");
      System.out.println("Deleting file: " + f.delete());
    }

  }
}
