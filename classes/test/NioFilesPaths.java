package classes.test;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.util.Arrays;

class NioFilesPaths {
  static void printFile(Path fPath) throws IOException {
    Files.lines(fPath).forEach(System.out::println);
  }

  private static FileSystem dfs = FileSystems.getDefault();

  public static void main(String[] args) throws IOException {
    final String testDir = "./classes/test/data/FileOps";
    final Path testDirPath = Paths.get("./classes/test/data/FileOps");
    // I like scopes.
    {
      // This file does not exist.
      final File f = Paths.get("/dfsd/dsfds").toFile();
      try {
        BufferedReader reader = new BufferedReader(new FileReader(f));
      } catch (Exception e) {
        System.out.println("Successfully threw exception for nonexistent file.");
      }
    }
    {
      Path p = Paths.get("");
      System.out.println("Is '' an absolute path?: " + p.isAbsolute());
      {
        Path pAbs = p.toAbsolutePath();
        Path pNorm = p.normalize();
        System.out.println("Real path:" + pNorm);
        System.out.println("Does the absolute path of '' exist?: " + Files.exists(pAbs));
        System.out.println("Does the normalized path of '' exist?: " + Files.exists(pNorm));
        System.out.println("Does abspath == norm.abspath?: " + (pAbs == pNorm.toAbsolutePath()));
        System.out.println("Does abspath.real == normalized path?: " + (pAbs.toRealPath() == pNorm));
      }
      System.out.println("Does '' exist?: " + Files.exists(p));
      System.out.println("What is the length of ''?: " + Files.size(p));
      System.out.println("Can you write to ''?: " + Files.isWritable(p));
    }

    final Path[] children = Files.list(testDirPath).toArray(Path[]::new);
    // Sort by name to avoid nondeterministic file orderings.
    Arrays.sort(children);
    for (final Path child : children) {
      System.out.println("["+child+"]");
    }

    {
      final Path p = testDirPath.resolve("contains_data.txt");
      System.out.println("Does contains_data.txt exist?: " + Files.exists(p));
      System.out.println("Length of contains_data.txt: " + Files.size(p));
    }

    {
      final Path p = Paths.get("/tmp");
      System.out.println("Is /tmp a directory?: " + Files.isDirectory(p));
      System.out.println("Can I write to it?: " + Files.isWritable(p));
    }

    {
      final Path p = Paths.get("/tmp", "temp_delete_me.txt");
      System.out.println("Does temp_delete_me.txt exist?: " + Files.exists(p));
      /* File creation fails currently because channels not yet implemented
      System.out.println("Did we successfully create this file?: " + Files.createFile(p));
      System.out.println("And does it exist now?: " + Files.exists(p));
      final long lm = Files.getLastModifiedTime(p).toMillis();
      System.out.println("Can I write to it?: " + Files.isWritable(p));
      // BrowserFS doesn't implement chmod anymore for the temporary file system.
      // f.setWritable(false);
      // System.out.println("How about now?: " + f.canWrite());
      // f.setWritable(true);
      // System.out.println("And now?: " + f.canWrite());
      System.out.println("File size: " + Files.size(p));

      // write over empty file
      BufferedWriter bfw = Files.newBufferedWriter(p);
      bfw.write("Why, hello there!\n");
      bfw.close();

      // mtime is platform-specific and not guaranteed to update
      Files.setLastModifiedTime(p, FileTime.fromMillis(System.currentTimeMillis()+1337));  // padding for fast execution
      System.out.println("Last modified updated?: " + (Files.getLastModifiedTime(p).toMillis() > lm));
      System.out.println("New file size: " + Files.size(p));
      System.out.println("File contents:");
      printFile(p);
      // append a line
      System.out.println("Appending to file's end...");
      final BufferedWriter bfw2 = Files.newBufferedWriter(p, StandardOpenOption.APPEND);
      bfw2.write("A second line");
      bfw2.close();

      System.out.println("New file size: " + Files.size(p));
      System.out.println("File contents:");
      printFile(p);

      // overwrite some text
      System.out.println("Overwriting some text...");
      RandomAccessFile raf = new RandomAccessFile(f, "rw");
      raf.skipBytes(17);
      raf.writeChars("KILROY WAS HERE\n");
      raf.close();
      System.out.println("File size: " + f.length());
      System.out.println("File contents:");
      printFile(f);
      System.out.println("Deleting file: " + Files.deleteIfExists(p));
      System.out.println("Does the file exist?: " + Files.exists(p));
      */
    }

    // Create and delete a directory.
    {
      Path p = Paths.get("/tmp","tempDir");
      System.out.println("Does tempDir exist?: " + Files.exists(p));
      System.out.println("Making tempDir: " + Files.createDirectory(p));
      System.out.println("Does tempDir exist now?: " + Files.exists(p));
      System.out.println("Deleting tempDir: " + Files.deleteIfExists(p));
      System.out.println("Does tempDir exist now?: " + Files.exists(p));
    }
    {
      Path p = Paths.get("/tmp", "tempDir/tempDir");
      Path p2 = Paths.get("/tmp", "tempDir");
      System.out.println("Does tempDir/tempDir exist?: " + Files.exists(p));
      System.out.println("Making tempDir/tempDir : " + Files.createDirectories(p));
      System.out.println("Does tempDir/tempDir exist now?: " + Files.exists(p));
      System.out.println("Does tempDir exist now?: " + Files.exists(p2));
      try {
        System.out.println("Deleting tempDir (should fail -- nonempty): " + Files.deleteIfExists(p2));
      } catch (final DirectoryNotEmptyException dne) {
        System.out.println("Couldn't delete non-empty directory");
      }
      System.out.println("Deleting tempDir/tempDir: " + Files.deleteIfExists(p));
      System.out.println("Deleting tempDir: " + Files.deleteIfExists(p2));
      System.out.println("Does tempDir/tempDir exist now?: " + Files.exists(p));
      System.out.println("Does tempDir exist now?: " + Files.exists(p2));
    }

    {
      final Path p = Paths.get("/tmp");
      try {
        System.out.println("Trying to create a directory that already exists: " + Files.createDirectory(p));
      } catch (final FileAlreadyExistsException fae) {
        System.out.println("couldn't create a directory that already exists");
      }
    }

    /*
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
    */

  }
}
