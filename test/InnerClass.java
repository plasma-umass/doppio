// test inner classes
public abstract class InnerClass {
  public abstract void run();
  public static void runFunctor(InnerClass a){
  	a.run();
  }
  static class Foo extends InnerClass {
  	public void run(){
  		int a = 5^3;
  	}
  }
  public static void main(String[] args) {
    InnerClass.runFunctor(new InnerClass(){
    	public void run(){
    		int a = 5<<3;
    	}
    });
    InnerClass.runFunctor(new Foo());
  }
}
