//comparing Strings with and without intern()ing.
package classes.test;
public class StringInternExample {
    private static char[] chars =
        {'A', ' ', 'S', 't', 'r', 'i', 'n', 'g'};

    public static void main(String[] args) {
        // (0) For the base case, we just use a String literal
        String aString = "A String";

        // (1) For the first test case, we construct a String by
        // concatenating several literals. Note, however,
        // that all parts of the string are known at compile time.
        String aConcatentatedString = "A" + " " + "String";

        test(aString,aConcatentatedString,true,true);

        // (2) For the second case, construct the same String, but
        // in a way such that it's contents cannot be known
        // until runtime.
        String aRuntimeString = new String(chars);

        // Verify that (0) and (2) are the same according
        // to equals(...), but not ==
        test(aString,aRuntimeString,false,true);

        // (3) For the third case, create a String object by
        // invoking the intern() method on (3).
        String anInternedString = aRuntimeString.intern();

        // Verify that (0) and (3) now reference the same
        // object.
        test(aString,anInternedString,true,true);

        // (4) For the forth case, we explicitly construct
        // String object around a literal.
        String anExplicitString = new String("A String");

        // Verify that (0) and (4) are different objects.
        // Interning would solve this, but it would be
        // better to simply avoid constructing a new object
        // around a literal.
        test(aString,anExplicitString,false,true);

        // (5) For a more realistic test, compare (0) to
        // the first argument. This illustrates that unless
        // intern()'d, Strings that originate externally
        // will not be ==, even when they contain the
        // same values.
        if (args.length > 0) {
            String firstArg = args[0];
            test(aString,firstArg,false,true);

            // (6) Verify that interning works in this case
            String firstArgInterned = firstArg.intern();
            test(aString,firstArgInterned,true,true);
        }

        // check that we have sanitized native JS properties when interning. If
        // we use Object.create(null) without sanitizing '__proto__', the first
        // call will cause the cache's prototype to point to an object, and the
        // second will then access a native JS function.
        test("__proto__", "__proto__", true, true);
        test("valueOf", "valueOf", true, true);
    }

    private static void test(String s1, String s2, boolean e1, boolean e2) {
        if ((s1 == s2) != e1) throw new RuntimeException("string == failed");
        if (s1.equals(s2) != e2) throw new RuntimeException("string .equals failed");
    }

}
