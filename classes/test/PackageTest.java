package classes.test;

import java.lang.annotation.Annotation;

class PackageTest {
  static private String b2s(boolean b) {
    return b ? "True" : "False";
  }
  static private void printPackage(Package pkg) {
    System.out.println("NOW PRINTING PACKAGE: " + pkg.getName());
    System.out.println("======================================================");
    System.out.println("Implementation title exists: " + b2s(pkg.getImplementationTitle() != null));
    System.out.println("Implementation vendor exists: " + b2s(pkg.getImplementationVendor() != null));
    System.out.println("Implementation version exists: " + b2s(pkg.getImplementationVersion() != null));
    System.out.println("Specification title: " + pkg.getSpecificationTitle());
    System.out.println("Specification vendor: " + pkg.getSpecificationVendor());
    System.out.println("Specification version: " + pkg.getSpecificationVersion());
    System.out.println("Is it compatible with 1.6? " + pkg.isCompatibleWith("1.6"));
    System.out.println("Is it sealed? " + pkg.isSealed());
    System.out.println("String representation: " + pkg.toString());
    System.out.println("Annotations:");
    Annotation[] annotations = pkg.getAnnotations();
    for (Annotation ant : annotations) {
      System.out.println("\t" + ant.toString());
    }
    System.out.println("Declared Annotations:");
    Annotation[] declaredAnt = pkg.getDeclaredAnnotations();
    for (Annotation ant : declaredAnt) {
      System.out.println("\t" + ant.toString());
    }
    System.out.println("======================================================");
  }

  static public void main(String[] args) {
    Package pkg = Package.getPackage("java.lang");
    printPackage(pkg);
  }
}