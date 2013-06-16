// test inner classes
package classes.test;
public abstract class InnerClass {
  // These first few classes are used to check disassembler
  // conformance
  private static class PrivateInner {}
  private abstract class PrivateInnerAbstract {}
  protected class ProtectedInner {}
  protected abstract class ProtectedInnerAbstract {}
  
  public abstract void run();
  public static void runFunctor(InnerClass a){
    a.run();
  }
  static class Foo extends InnerClass {
    public void run(){
      int a = 5^3;
      System.out.println(a);
    }

    static class Bar { }
  }
  public static void main(String[] args) {
    InnerClass.runFunctor(new InnerClass(){
      public void run(){
        int a = 5<<3;
        System.out.println(a);
      }
    });
    InnerClass.runFunctor(new Foo());

    System.out.println(InnerClass.class.getDeclaringClass());
    System.out.println(Foo.class.getDeclaringClass().getName());
    System.out.println(Foo.Bar.class.getDeclaringClass().getName());
    System.out.println(Foo.class.getName());
    System.out.println(Foo.class.getSimpleName());
    System.out.println(Foo.Bar.class.getSimpleName());
    for (Class c : InnerClass.class.getDeclaredClasses())
      System.out.println(c.getName());
    for (Class c : Foo.class.getDeclaredClasses())
      System.out.println(c.getName());
  }
}
