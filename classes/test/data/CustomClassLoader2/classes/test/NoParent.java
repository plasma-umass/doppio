package classes.test;
class NoParent extends NotHere {
  public NoParent() {};
}
// Delete my class file before the ClassLoader test.
class NotHere {
  public NotHere() {};
}