package classes.test;

import java.io.*;

class FileOps {
  public static void main(String[] args) throws IOException {
    // I like scopes.
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

    for (File child : new File("./classes/test/data/FileOps").listFiles()) {
      System.out.println(child.getName());
    }

    {
      File f = new File("./classes/test/data/FileOps/contains_data.txt");
      System.out.println("Does contains_data.txt exist?: " + f.exists());
      System.out.println("Length of contains_data.txt: " + f.length());
      System.out.println("Can I write to contains_data.txt?:  " + f.canWrite());
    }

    {
      File f = new File("./classes/test/data/FileOps");
      System.out.println("Is FileOps a directory?: " + f.isDirectory());
      System.out.println("Can I write to it?: " + f.canWrite());
    }

    {
      File f = new File("./classes/test/data/FileOps/temp_delete_me.txt");
      System.out.println("Does temp_delete_me.txt exist?: " + f.exists());
      System.out.println("Did we successfully create this file?: " + f.createNewFile());
      System.out.println("And does it exist now?: " + f.exists());
      long lm = f.lastModified();
      System.out.println("Can I write to it?: " + f.canWrite());
      f.setWritable(false);
      System.out.println("How about now?: " + f.canWrite());
      f.setWritable(true);
      System.out.println("And now?: " + f.canWrite());
      System.out.println("File size: " + f.length());
      System.out.println("Sleeping for a small amount of time...");
      try {
        Thread.sleep(400);
      } catch (Exception e) {}
      FileWriter fw = new FileWriter(f);
      fw.write("Why, hello there!");
      fw.close();
      System.out.println("New file size: " + f.length());
      System.out.println("File contents:");
      // Oh, Java... :/
      BufferedReader br = new BufferedReader(new FileReader(f));
      String s;
      while ((s = br.readLine()) != null)
        System.out.println(s);
      br.close();
      System.out.println("Now, has the modified time changed? " + (lm < f.lastModified()));
      System.out.println("Deleting file: " + f.delete());
      System.out.println("Does the file exist?: " + f.exists());
    }

  }
}