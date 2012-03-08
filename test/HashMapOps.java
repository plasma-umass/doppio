// test basic hash map operations
import java.util.HashMap;
public class HashMapOps {
  public static void main(String[] args) {
    HashMap<String,Integer> foo = new HashMap<String,Integer>();
    foo.put("hello",5);
    foo.put("world",5);
    foo.put("hello",604);
    int a = foo.get("hello");
    int b = foo.get("world");
    System.out.println("hello is " + a);
    System.out.println("world is " + b);
  }
}
