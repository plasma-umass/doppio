package classes.test;

class Interfaces {
  public static void WorkOnCat(Cat acat) {
    System.out.println("Cat: " + acat.animalConst + ", " + acat.someOtherConst);
    acat.MakeNoise();
    acat.Purr();
  }

  public static void WorkOnAnimal(Animal an) {
    System.out.println("Animal: " + an.animalConst + ", " + an.someOtherConst);
    an.MakeNoise();
  }

  public static void WorkOnCatImpl(CatImpl cat) {
    System.out.println("CatImpl: " + cat.animalConst + ", " + cat.someOtherConst);
    cat.MakeNoise();
    cat.Purr();
  }

  public static void WorkOnCheshireCat(CheshireCat ccat) {
    System.out.println("CheshireCat: " + ccat.someOtherConst);
    ccat.MakeNoise();
    ccat.Purr();
  }

  public static void main(String[] args) {
    CatImpl aCatImpl = new CatImpl();
    WorkOnCatImpl(aCatImpl);
    WorkOnCat(aCatImpl);
    WorkOnAnimal(aCatImpl);

    CheshireCat ccCat = new CheshireCat();
    WorkOnCheshireCat(ccCat);
    WorkOnCatImpl(ccCat);
    WorkOnCat(ccCat);
    WorkOnAnimal(ccCat);
  }
}

class Fine {
  public Fine(String s) {
    System.out.println(s + " Initialized");
  }
}

// We use StringBuilders below to force a getstatic on the fields. Strings and
// basic types are just grabbed from the constant pool.

interface Animal {
  Fine f = new Fine("Animal");
  StringBuilder someOtherConst = new StringBuilder("5");
  StringBuilder animalConst = new StringBuilder("3");
  public void MakeNoise();
}

interface Cat extends Animal {
  Fine g = new Fine("Cat");
  StringBuilder animalConst = new StringBuilder("2");
  public void Purr();
}

class CatImpl implements Cat {
  Fine h = new Fine("CatImpl");
  StringBuilder animalConst = new StringBuilder("1");
  public void Purr() {
    System.out.println("*purrs loudly*");
  }
  public void MakeNoise() {
    System.out.println("Meow!");
  }
}

// I'm so crazy. Note that javac doesn't let you reference animalConst through
// CheshireCat due to ambiguity, despite their well-defined field lookup
// procedure... :(
class CheshireCat extends CatImpl implements Cat {
  Fine i = new Fine("CheshireCat");
  public void Purr() {
    System.out.println("I don't do that.");
  }
  public void MakeNoise() {
    System.out.println("*snickers*");
  }
}
