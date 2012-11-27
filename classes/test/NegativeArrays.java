package classes.test;

public class NegativeArrays {
	public static void main(String[] args) {
		System.out.print("Test 1: ");
		try {
			int[] i = new int[-10];
			System.out.println("FAIL");
		} catch (NegativeArraySizeException e) {
			System.out.println("PASS");
		}

		System.out.print("Test 2: ");
		try {
			int[][] i = new int[-10][10];
			System.out.println("FAIL");
		} catch (NegativeArraySizeException e) {
			System.out.println("PASS");
		}

		System.out.print("Test 3: ");
		try {
			int[][] i = new int[10][-10];
			System.out.println("FAIL");
		} catch (NegativeArraySizeException e) {
			System.out.println("PASS");
		}

		System.out.print("Test 4: ");
		try {
			int[][] i = new int[-10][-10];
			System.out.println("FAIL");
		} catch (NegativeArraySizeException e) {
			System.out.println("PASS");
		}
	}
}
