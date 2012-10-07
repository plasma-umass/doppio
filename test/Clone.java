package test;

public class Clone implements Cloneable {
  private static final int NDIM = 3;
  int[] vals;
  public Clone(){
    vals = new int[NDIM];
    vals[0] = 7;
    vals[1] = 8;
    vals[2] = 9;
  }
  public Object clone(){
    try{
      Clone c = (Clone)super.clone();
      c.vals = new int[NDIM];
      c.vals[0] = vals[0];
      c.vals[1] = vals[1];
      c.vals[2] = vals[2];
      return c;
    } catch (CloneNotSupportedException e){
      throw new Error();
    }
  }
  public String toString() {
    return "["+vals[0]+","+vals[1]+","+vals[2]+"]";
  }
  public static void main(String[] args) {
    Clone c = new Clone();
    Clone c2 = (Clone)c.clone();
    System.out.println("c orig: "+c);
    System.out.println("c2 orig: "+c2);
    c.vals[1] = 0;
    c2.vals[2] = 0;
    System.out.println("c: "+c);
    System.out.println("c2: "+c2);
  }
}
