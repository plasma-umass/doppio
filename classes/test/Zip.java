package classes.test;

import java.util.zip.Inflater;
import java.util.zip.Deflater;

/**
 * Tests Doppio's natively implemented zip functions.
 */
class Zip {
	public static void main(String[] args) {
		try {
			// Encode a String into bytes
			String inputString = "This is my input string.";
			byte[] input = inputString.getBytes("UTF-8");
			int originalLength = inputString.length();

			// Compress the bytes
			byte[] output = new byte[100];
			Deflater compresser = new Deflater();
			compresser.setInput(input);
			compresser.finish();
			int compressedDataLength = compresser.deflate(output);
			assert compressedDataLength < originalLength;

			// Decompress the bytes
			Inflater decompresser = new Inflater();
			decompresser.setInput(output, 0, compressedDataLength);
			byte[] result = new byte[100];
			int resultLength = decompresser.inflate(result);
			decompresser.end();
			assert resultLength == originalLength;

			//Decode the bytes into a String
			String outputString = new String(result, 0, resultLength, "UTF-8");
			assert outputString.equals(inputString);
		} catch (UnsuportedEncodingException e) {
			System.out.println(e);
		} catch (DataFormatException e) {
			System.out.println(e);
		}
	}
}
