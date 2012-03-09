package test;

public class ClassCast {
    public static void main(String[] args) {
        try {
            A a = new A();
            Object b = new B();
            a = (A)b;
        }
        catch (ClassCastException e) {
            System.out.println("Caught ClassCastException as expected: " + e.getMessage());
        }
    }
}

class A {
    int a;
}

class B {
    int a;
}
