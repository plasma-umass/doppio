package classes.test;

public class Dup {

  public static void main(String[] args) {
    // do it twice so we know the adding was done correctly in the first call
    System.out.println(dup2());
    System.out.println(dup2());

    DupMore d = new DupMore();
    System.out.println(d.dup2_x1());
    System.out.println(d.dup2_x1());

    System.out.println(d.dup2_x2());
    System.out.println(d.dup2_x2());

    System.out.println(d.dup_x2());
    System.out.println(d.dup_x2());
  }

  private static long longValue = 5;

  // this function generates the dup2 instruction
  public static long dup2() {
    return longValue++;
  }

  static class DupMore {
    private long longValue = 4;

    private long[] longArr = { 1 };

    // since this is not static, the 'this' operand causes javac to generate dup_x1
    public long dup2_x1() {
      return longValue++;
    }

    void popLong(long a) {}

    // the array ref operand makes this a dup_x2
    public long dup2_x2() {
      return longArr[0]++;
    }

    private static int intArr[] = { 4 };

    public static int dup_x2() {
      return intArr[0]++;
    }
  }
}
