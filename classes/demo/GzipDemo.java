package classes.demo;

import java.io.*;
import java.util.*;
import java.util.zip.*;

public class GzipDemo {
    static final int CHUNK_SIZE = 512;  // number of bytes to decompress at a time

    static byte[] fileToByteArray(String filename) throws IOException {
        File file = new File(filename);
        byte[] fileData = new byte[(int)file.length()];
        DataInputStream dis = new DataInputStream(new FileInputStream(file));
        dis.readFully(fileData);
        dis.close();
        return fileData;
    }

    public static void compressFile(String infile, String outfile) 
    throws FileNotFoundException, IOException {
        GZIPOutputStream gzip = new GZIPOutputStream(new FileOutputStream(outfile));
        gzip.write(fileToByteArray(infile));
        gzip.close();
    }

    public static void decompressFile(String infile, String outfile)
    throws FileNotFoundException, IOException {
        GZIPInputStream gzip = new GZIPInputStream(new FileInputStream(infile));
        FileOutputStream out = new FileOutputStream(outfile);
        byte[] buffer = new byte[CHUNK_SIZE];
        int bytes_read;
        while ((bytes_read = gzip.read(buffer,0,CHUNK_SIZE)) != -1) {
            out.write(buffer, 0, bytes_read);
        }
        out.close();
    }

    public static void main(String[] args)
    throws FileNotFoundException, IOException {
      if (args.length < 3) {
        System.out.println("Usage: [c|d] <infile> <outfile>");
        return;
      }

      if (args[0].equals("c")) {
        compressFile(args[1],args[2]);
      } else if (args[0].equals("d")) {
        decompressFile(args[1],args[2]);
      } else
        System.out.println("Unrecognized option! Use 'c' or 'd'");
    }

}
