package classes.special_test;
import java.io.IOException;
public class StdIn {
  public static void main(String[] args) {
    for (int i=0; i<3; i++) {
      int inChar;
      System.out.println("Enter a Character (" + (2-i) + " left):");
      try {
        inChar = System.in.read();
        System.out.print("You entered ");
        System.out.println((char)inChar);
      }
      catch (IOException e){
        System.out.println("Error reading from user");
      }
    }
  }
}
