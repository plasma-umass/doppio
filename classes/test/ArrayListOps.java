package classes.test;
import java.util.*;
public class ArrayListOps {
  public static void main(String[] args) {
    List<Integer> lst = new ArrayList<Integer>();
    lst.add(1);
    lst.add(2);
    lst.add(1, 3);
    List<Integer> another_lst = new ArrayList<Integer>();
    another_lst.add(4);
    another_lst.add(5);
    lst.addAll(another_lst);
    for (Integer i : lst) 
      System.out.println(i);
  }
}
