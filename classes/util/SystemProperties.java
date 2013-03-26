package classes.util;

class SystemProperties {
	public static void main (String[] args) {
		for (String prop : args) {
      System.out.println(prop + " => " + System.getProperty(prop));
		}
	}
}
