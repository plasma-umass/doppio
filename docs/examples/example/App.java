package example;

import java.io.*;
import java.util.Scanner;

class App {
  public static void main(String[] args) {
    System.out.println("DoppioJVM now booted!");
    Scanner stdin = new Scanner(System.in);
    System.out.println("What is your name?");
    if (stdin.hasNextLine())
    {
        String name = stdin.nextLine();
        System.out.println("Hello, " + name + "!");
    }
  }
}