package classes.test;
class Dog extends Animal implements Speakable {
  private String breed;
  public Dog(String name, String breed) {
    super (name);
    this.breed = breed;
  }

  public String toString() {
    return this.getName() + ';' + this.breed;
  }

  public String speak() {
    return "Woof! Woof!";
  }
}
class Animal {
  String name;
  protected Animal(String name) {
    this.name = name;
  }

  protected String getName() { return name; }

  public String dontUse() { return "DON'T!"; }
}
interface Speakable {
  String speak();
}