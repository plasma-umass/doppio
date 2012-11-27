// test basic hash map operations
package classes.test;
import java.util.*;
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

    foo.clear();
    Set<Map.Entry<String, Integer>> es = foo.entrySet();
    if (es.size() != 0)
        throw new RuntimeException("foo should have a 0-size entrySet, had size "+es.size());
    for (Map.Entry<String,Integer> e : es) {
        throw new RuntimeException("Should not have gotten here!");
    }
  }
}
