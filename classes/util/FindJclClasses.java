package classes.util;

import java.io.File;

class FindJclClasses {
	private static boolean fileExists(String filepath) {
		return (new File(filepath)).exists();
	}

	public static void main (String[] args) {
		String[] classPath = System.getProperty("sun.boot.class.path").split(":");
		for (String path : classPath) {
			if (path.endsWith("jre/lib/rt.jar")) {
				String toolPath = path.replace("jre/lib/rt.jar", "lib/tools.jar");
				String resourcesPath = path.replace("/rt.jar", "/resources.jar");
				if (fileExists(path) && fileExists(toolPath) && fileExists(resourcesPath)) {
					System.out.println(path);
					System.out.println(toolPath);
					System.out.println(resourcesPath);
					return;
				}
			} else if (path.endsWith("classes.jar")) {
				if (fileExists(path)) {
					System.out.println(path);
					return;
				}
			}
		}
	}
}
