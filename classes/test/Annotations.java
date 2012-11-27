package classes.test;

import java.lang.annotation.Annotation;

@Deprecated
class Annotations {
  public static void main(String[] args) {
    for (Annotation a : Annotations.class.getAnnotations()) {
      System.out.println(a);
    }
  }
}
