package classes.test;

import java.util.zip.Inflater;
import java.util.zip.Deflater;
import java.io.IOException;
import java.util.zip.DataFormatException;

/**
 * Tests Doppio's natively implemented zip functions.
 */
class Zip {
	public static void main(String[] args) {
		try {
			// Encode a String into bytes
			String inputString = "blahblahblahblah";
			System.out.println(inputString);

			byte[] input = inputString.getBytes("UTF-8");
			int originalLength = inputString.length();
			System.out.println(originalLength);

			// Compress the bytes
			byte[] output = new byte[100];
			Deflater compressor = new Deflater();
			compressor.setInput(input);
			compressor.finish();
			int compressedDataLength = compressor.deflate(output);
			System.out.println(compressedDataLength);

			// Decompress the bytes
			Inflater decompressor = new Inflater();
			decompressor.setInput(output, 0, compressedDataLength);
			byte[] result = new byte[100];
			int resultLength = decompressor.inflate(result);
			decompressor.end();
			System.out.println(resultLength);

			//Decode the bytes into a String
			String outputString = new String(result, 0, resultLength, "UTF-8");
			System.out.println(outputString);
			
		} catch (IOException e) {
			System.out.println(e);
		} catch (DataFormatException e) {
			System.out.println(e);
		}
	}
}
