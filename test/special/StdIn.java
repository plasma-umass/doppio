package test;
import java.io.IOException;
public class StdIn {
  public static void main(String[] args) {
    int inChar;
    System.out.println("Enter a Character:");
    try {
      inChar = System.in.read();
      System.out.print("You entered ");
      System.out.println(inChar);
    }
    catch (IOException e){
      System.out.println("Error reading from user");
    }
  }
}
