
public class Switch {
  public static void main(String[] args) {
    int a = 1;
    // this switch statement is dense, so it produces the 'tableswitch'
    // instruction
    switch (a) {
      case 1: return;
      case 2: return;
      case 3: return;
      case 4: return;
      case 5: return;
      default: break;
    }

    // this switch statement is sparse, so it produces the 'lookupswitch'
    // instruction
    switch (a) {
        case 1: return;
        case 5: return;
        default: break;
    }
    String b = "we should never get here";
  }
}
