package classes.test;

import javax.script.*;
import java.util.Date;
/**
 * Tests DoppioJVM's ability to pull in Nashorn's JAR file and use it seamlessly.
 * Sample code taken from http://winterbe.com/posts/2014/04/05/java8-nashorn-tutorial/
 */
class NashornTest {
  public static String prop1 = "I'm a property.";
  public static String fun1(String name) {
    System.out.format("Hi there from Java, %s", name);
    return "greetings from java";
  }
  public static void main(String[] args) throws Exception {
    // Run JS code.
    ScriptEngine engine = new ScriptEngineManager().getEngineByName("nashorn");
    engine.eval("print('Hello World!');");

    // JVM -> JS
    engine.eval("var fun1 = function(name) {\nprint('Hi there from Javascript, ' + name);\nreturn 'greetings from javascript';};\nvar fun2 = function (object) {\nprint('JS Class Definition: ' + Object.prototype.toString.call(object));\n};");
    Invocable invocable = (Invocable) engine;
    Object result = invocable.invokeFunction("fun1", "Peter Parker");
    System.out.println(result);
    System.out.println(result.getClass());
    invocable.invokeFunction("fun2", new Date());

    // JS -> JVM
    engine.eval("Java.type(\"java.lang.System\").out.println('Hello, JVM print function!');\nvar MyJavaClass = Java.type(\"classes.test.NashornTest\");\nprint(MyJavaClass);\n");
    // Disabled because I can't get this code working in native Java!
    // print(MyJavaClass.prop1);\nvar result = MyJavaClass.fun1('John Doe');\nprint(result);
  }
}