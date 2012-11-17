
package classes.special_test;
import java.util.Calendar;

// this test is under 'special' since it never returns the same
// value twice, making clean diffs impossible
public class GetTime {
  public static void main(String[] args) {
    Calendar cal = Calendar.getInstance();
    System.out.println("Current milliseconds since 13 Oct, 2008 are :"
      + cal.getTimeInMillis());
  }
}
