package classes.demo;

import bsh.Interpreter;
import bsh.EvalError;

public class BSHDemo {
   public static void main(String[] args) {
      Interpreter bsh = new bsh.Interpreter();
      try {
        
        bsh.set("x",6);
        bsh.set("y",7);
        bsh.eval("answer = x * y;");
        System.out.println( bsh.get("answer"));
        bsh.eval("int sum = 0; for (int i =0; i <=10; i++) {sum += i;}; answer=sum;");
        
        System.out.println( bsh.get("answer"));

        bsh.eval("int f1(int x) { return x + 2;}");
        bsh.eval("answer = f1(4)");
        System.out.println( bsh.get("answer"));
        
        bsh.eval("print (1+2)"); // Doppio Crash
        
      } catch(bsh.EvalError ee) {
        System.out.println("Threw "+ee);
      }
   }
}
