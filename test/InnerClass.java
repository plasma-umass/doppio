// test inner classes
package test;
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
  }
}
