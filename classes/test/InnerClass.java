// test inner classes
package classes.test;
public abstract class InnerClass {
  public abstract void run();
  public static void runFunctor(InnerClass a){
    a.run();
  }
  static class Foo extends InnerClass {
    public void run(){
      int a = 5^3;
      System.out.println(a);
    }
  }
  public static void main(String[] args) {
    InnerClass.runFunctor(new InnerClass(){
      public void run(){
        int a = 5<<3;
        System.out.println(a);
      }
    });
    InnerClass.runFunctor(new Foo());

    System.out.println(Foo.class.getName());
    System.out.println(Foo.class.getDeclaringClass().getName());
    System.out.println(Foo.class.getSimpleName());
    for (Class c : InnerClass.class.getDeclaredClasses())
      System.out.println(c.getName());
  }
}
