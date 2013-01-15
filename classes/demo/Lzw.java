package classes.demo;

import java.util.*;
import java.io.*;
 
public class Lzw {
    /** Compress a string to a list of output symbols. */
    public static List<Integer> compress(String uncompressed) {
        // Build the dictionary.
        int dictSize = 256;
        Map<String,Integer> dictionary = new HashMap<String,Integer>();
        for (int i = 0; i < 256; i++)
            dictionary.put("" + (char)i, i);
 
        String w = "";
        List<Integer> result = new ArrayList<Integer>();
        for (char c : uncompressed.toCharArray()) {
            String wc = w + c;
            if (dictionary.containsKey(wc))
                w = wc;
            else {
                result.add(dictionary.get(w));
                // Add wc to the dictionary.
                dictionary.put(wc, dictSize++);
                w = "" + c;
            }
        }
 
        // Output the code for w.
        if (!w.equals(""))
            result.add(dictionary.get(w));
        return result;
    }
 
    /** Decompress a list of output ks to a string. */
    public static String decompress(List<Integer> compressed) {
        // Build the dictionary.
        int dictSize = 256;
        Map<Integer,String> dictionary = new HashMap<Integer,String>();
        for (int i = 0; i < 256; i++)
            dictionary.put(i, "" + (char)i);
 
        String w = "" + (char)(int)compressed.remove(0);
        String result = w;
        for (int k : compressed) {
            String entry;
            if (dictionary.containsKey(k))
                entry = dictionary.get(k);
            else if (k == dictSize)
                entry = w + w.charAt(0);
            else
                throw new IllegalArgumentException("Bad compressed k: " + k);
 
            result += entry;
 
            // Add w+entry[0] to the dictionary.
            dictionary.put(dictSize++, w + entry.charAt(0));
 
            w = entry;
        }
        return result;
    }

    static String fileToString(String filename)
    throws FileNotFoundException, IOException {
      File f = new File(filename);
      BufferedReader in = new BufferedReader(new FileReader(f));
      char[] buffer = new char[(int)f.length()];
      int i = 0;
      int c;
      while ((c = in.read()) != -1) {
        buffer[i++] = (char)c;
      }
      return new String(buffer);
    }


    public static void compressFile(String infile, String outfile) 
    throws FileNotFoundException, IOException {
      // slurp into string
      String text = fileToString(infile);
      OutputStreamWriter out = new OutputStreamWriter(new FileOutputStream(outfile));
      for (Integer i : compress(text)) {
        out.write((char)i.intValue());
      }
      out.close();
    }

    public static void decompressFile(String infile, String outfile)
    throws FileNotFoundException, IOException {
      List<Integer> compressed = new ArrayList<Integer>();
      FileInputStream in = new FileInputStream(infile);
      int b;
      while ((b = in.read()) != -1) {
        compressed.add(b);
      }
      OutputStreamWriter out = new OutputStreamWriter(new FileOutputStream(outfile));
      out.write(decompress(compressed));
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
