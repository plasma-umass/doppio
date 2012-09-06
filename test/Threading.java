package test;

import java.lang.Thread;

public class Threading extends Thread {

  public void run() {
    System.out.println("hello from thread");
  }

  public static void main(String[] args) {
    Threading t = new Threading();
    t.start();
  }
}