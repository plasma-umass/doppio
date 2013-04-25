package classes.test;

import java.lang.annotation.Annotation;
import java.util.HashSet;

class PackageTest {
  static public void main(String[] args) {
    Package pkg = Package.getPackage("java.lang");
    System.out.println(pkg.getName());

    Package[] pkgs = Package.getPackages();
    // we don't initialize / support all the same classes as HotSpot, so just
    // check that a few basic ones are indeed there
    HashSet<String> names = new HashSet<String>();
    names.add("java.lang");
    names.add("java.io");
    names.add("java.util");
    for (Package p : pkgs) {
      String name = p.getName();
      if (names.contains(name))
        System.out.println("Found system package with name: " + name);
    }
  }
}
