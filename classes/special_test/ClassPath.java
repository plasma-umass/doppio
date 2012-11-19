package classes.special_test;

public class ClassPath {

  public static void main(String[] args) {
    // run with java -cp and ./console/runner.coffee --classpath
    System.out.println(System.getProperty("java.class.path"));
  }

}
