package classes.test;

import java.util.Map;
import java.util.TreeMap;

public class ClassCast {
    public ClassCast() {
        A a = new A();
        Object b = new B();
        try {
            a = (A)b;
        }
        catch (ClassCastException e) {
            System.out.println("Caught ClassCastException as expected: " + e.getMessage());
        }
        System.out.println(A.class.isInstance(a));
        System.out.println(A.class.isInstance(b));

        Map<String, Integer> foo = new TreeMap<String, Integer>();
        // these puts are necessary so that the casting isn't optimized to a nop
        foo.put("quick",614);
        foo.put("brown",104);
        foo.put("fox",124);
        TreeMap<String, Integer> bar = (TreeMap<String, Integer>)foo;

        System.out.println(foo instanceof TreeMap);
        System.out.println(bar instanceof TreeMap);
    }
    public static void main(String[] args) {
        new ClassCast();
    }
    class A { int a; }
    class B { int a; }
}

