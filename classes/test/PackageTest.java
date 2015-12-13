package classes.test;

import java.lang.annotation.Annotation;
import java.util.HashSet;
import java.util.Arrays;
import java.io.File;

class PackageTest {
  static public void main(String[] args) throws Throwable {
    Package pkg = Package.getPackage("java.lang");
    System.out.println(pkg.getName());

    Package[] pkgs = Package.getPackages();
    Arrays.sort(pkgs, (p1,p2) -> p1.getName().compareTo(p2.getName()));
    // we don't initialize / support all the same classes as HotSpot, so just
    // check that a few basic ones are indeed there
    HashSet<String> names = new HashSet<String>();
    names.add("java.lang");
    names.add("java.io");
    names.add("java.util");
    for (Package p : pkgs) {
      String name = p.getName();
      if (names.contains(name))
        System.out.println("Found system package: " + p.toString());
    }
    // Ensure the code location is set. We can't test the exact value, as it differs
    // depending on the environment.
    System.out.println(PackageTest.class.getProtectionDomain().getCodeSource().getLocation() != null);
  }
}
