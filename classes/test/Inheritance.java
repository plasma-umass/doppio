package classes.test;

public class Inheritance {
	public Inheritance() {
		BChild ch = null;
		try {
			System.out.println("a: " + ch.a);
		} catch (NullPointerException e) {
			System.out.println("Cannot getfield on a null object.");
		}

		BChild child = new BChild();
		child.a = 3;
		child.b = 5;
		System.out.println("Child a: " + child.a);
		System.out.println("Parent a through child via getter: " + child.getA());
		System.out.println("Child b: " + child.b);
		AParent par = child;
		par.a = 4;
		System.out.println("Parent a: " + par.a);
		System.out.println("Parent a through getter: " + par.getA());
		System.out.println("Parent b: " + par.b);
		BChild child2 = (BChild) par;
		System.out.println("Child a: " + child2.a);
		System.out.println("Parent a through child via getter: " + child2.getA());
		System.out.println("Child b: " + child2.b);


		C pathological = new C();
		System.out.println(pathological.foo);
		System.out.println(((B)pathological).foo);
		System.out.println(((A)pathological).foo);
		pathological.foo = 1337;
		System.out.println(pathological.foo);
		System.out.println(((B)pathological).foo);
		System.out.println(((A)pathological).foo);
		((A)pathological).foo = 42;
		System.out.println(pathological.foo);
		System.out.println(((B)pathological).foo);
		System.out.println(((A)pathological).foo);
	}

	public static void main(String[] args) {
		new Inheritance();
	}

	class AParent {
		public int a;
		public int b;
		int getA() {
			return a;
		}
	}

	class BChild extends AParent {
		public int a;
	}

	class A {
		public short foo;
	}
	class B extends A {}
	class C extends B {
		public short foo;
	}
}
