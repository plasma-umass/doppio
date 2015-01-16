package classes.test;


import java.lang.annotation.*;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

@Deprecated
class Annotations {
  @Option(
      name = "Whoo"
  )
  public static boolean testField;

  public static boolean noAnnotationsField;

  @Option(
      name = "main",
      usage = "nope",
      required = true
  )
  public static void main(
      @Option( name="args" ) String[] args) throws NoSuchFieldException, NoSuchMethodException {
    System.out.println("Annotations on Annotations Class");
    for (Annotation a : Annotations.class.getAnnotations()) {
      System.out.println(a);
    }

    System.out.println("Annotations on TestField");
    Field tf = Annotations.class.getField("testField");
    for (Annotation a : tf.getAnnotations()) {
      System.out.println(a);
    }

    System.out.println("Annotations on NoAnnotationsField");
    Field naf = Annotations.class.getField("noAnnotationsField");
    for (Annotation a : naf.getAnnotations()) {
      System.out.println(a);
    }

    System.out.println("Annotations on main method");
    Method main = Annotations.class.getMethod("main", String[].class);
    for (Annotation a : main.getAnnotations()) {
      System.out.println(a);
    }

    System.out.println("Annotations on main method parameters");
    for(Annotation[] annotations : main.getParameterAnnotations()) {
      for (Annotation a : annotations) {
        System.out.println(a);
      }
    }

    System.out.println("Annotations on Option");
    for (Annotation a : Option.class.getAnnotations()) {
      System.out.println(a);
    }
  }
}
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.FIELD,ElementType.METHOD,ElementType.PARAMETER})
@interface Option {
  String name();
  String usage() default "";
  boolean required() default false;
}