package classes.test;
public class Switch {
  public static void main(String[] args) {
    tableSwitch(1);
    tableSwitch(2);
    tableSwitch(3);
    tableSwitch(4);
    tableSwitch(5);
    tableSwitch(6);
    lookupSwitch(1);
    lookupSwitch(2);
    lookupSwitch(5);
    lookupSwitch(6);
  }

  public static void tableSwitch(int a) {
    // this switch statement is dense, so it produces the 'tableswitch'
    // instruction
    switch (a) {
      case 1: System.out.println(1); break;
      case 2: System.out.println(2); break;
      case 3: System.out.println(3); break;
      case 4: System.out.println(4); break;
      case 5: System.out.println(5); break;
      default: break;
    }
  }

  public static void lookupSwitch(int a) {
    // this switch statement is sparse, so it produces the 'lookupswitch'
    // instruction
    switch (a) {
      case 1: System.out.println(1); break;
      case 5: System.out.println(5); break;
      default: break;
    }
  }
}
