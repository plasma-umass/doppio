// tests Object creation and members
public class OMember {
  String str;
  double dbl;
  public OMember(String a, double b) {
    this.str = a;
    this.dbl = b;
  }
	public static void main(String[] args) {
    OMember quux = new OMember("hello",-9.322);
	}
}
