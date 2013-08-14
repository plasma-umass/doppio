package classes.test;
import bsh.Interpreter;
import bsh.EvalError;

public class BeanShellTest {
   public static void main(String[] args) {
      Interpreter bsh = new bsh.Interpreter();
      try {
       
        bsh.set("x",6);
        bsh.set("y",7);
        bsh.eval("answer = x * y;");
       
        System.out.println( bsh.get("answer"));

        bsh.eval("int[][] ary = new int[10][5]; ary[2][3]=5;print( ary[2][3] + ary.length + ary[1].length);");
        bsh.eval("String[][] ary2 = new String[10][5]; ary2[2][3]=\"Entry\";print( ary2[2][3] + ary2.length + ary2[1].length );");

        bsh.eval("int[][] ioob= new int[10][5]; ioob[4][23]=5;");

        
        bsh.eval("print (1+2)"); 
        
        String strings = "String a = \"alphabet\";\n"+
        "String b = \"belvedere\";\n"+
        "String c = \"AlPhAbEt\";\n"+
        "String d = \"  \t alphabet  \\n \\t \";\n"+
        "int ia = 5;\n"+
        "int ib = 6;\n"+
        "\n"+
        "System.out.println(a.contains(\"phab\"));\n"+
        "System.out.println(a.contains(b));\n"+
        "System.out.println(a.startsWith(\"alpha\"));\n"+
        "System.out.println(a.endsWith(\"bet\"));\n"+
        "System.out.println(a.toUpperCase());\n"+
        "System.out.println(a.toLowerCase());\n"+
        "System.out.println(a.equalsIgnoreCase(c));\n"+
        "System.out.println(a.lastIndexOf(\"a\"));\n"+
        "System.out.println(a.length());\n"+
        "System.out.println(a.substring(4,6));\n"+
        "System.out.println(a.toString());\n"+
        "System.out.println(d);\n"+
        "System.out.println(d.trim());\n"+
        "System.out.println(a.replace('a','z'));\n"+
        "System.out.println(String.valueOf(1));\n"+
        "// sans newlines\n"+
        "System.out.print(1); System.out.print(2); System.out.println(3);\n"+
        "System.out.println(String.valueOf(1.5));\n"+
        "System.out.format(\"%s is asdf\", \"asdf\");\n";

        bsh.eval(strings); 
        // for,while,do-while
        String innerloops = "for(int i=0;i<10;i++) {int j= 0; while(++j<i) { int c3 = j; do print(c3); while (c3++<j);print((char)65);}}";
        bsh.eval(innerloops);
        
        String whileexpressionlessforloop = "int c4=0;boolean q = false;while(!q) for(;;) {c4++;if(c4>100) {q=true;break;}}";
        bsh.eval(whileexpressionlessforloop);
        
        bsh.eval("print (\"Done\");");
      } catch(Exception e) {
        System.out.println("Threw " + e);
      }
   }
}


