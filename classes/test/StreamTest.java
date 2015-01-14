package classes.test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.OptionalInt;
import java.util.stream.Stream;
import java.util.stream.Collectors;

/**
 * Tests invokedynamic by doing tons of stream operations.
 */
public class StreamTest {
  public static void main(String[] args) {
    {
      List<String> l = new ArrayList(Arrays.asList("one", "two"));
      Stream<String> sl = l.stream();
      l.add("three");
      String s = sl.collect(Collectors.joining(" "));
      System.out.println(s);
    }

    {
      List<Widget> widgets = new ArrayList(Arrays.asList(new Widget(Color.GREEN, 9999), new Widget(Color.RED, 10), new Widget(Color.RED, 2), new Widget(Color.BLUE, 3)));
      int sumOfWeights = widgets.parallelStream()
          .filter(b -> b.getColor() == Color.RED)
          .mapToInt(b -> b.getWeight())
          .sum();
      int singleThreadedSum = widgets.stream()
          .filter(b -> b.getColor() == Color.RED)
          .mapToInt(b -> b.getWeight())
          .sum();
      System.out.println("Parallel: " + sumOfWeights + " Single threaded: " + singleThreadedSum);

      OptionalInt heaviest = widgets.parallelStream().mapToInt(Widget::getWeight).max();
      System.out.println("Heaviest widget weight: " + heaviest.orElse(-1));
    }

    {
      List<Integer> numbers = new ArrayList<Integer>(Arrays.asList(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
      int sumLoop = 0;
      for (int x : numbers) {
        sumLoop += x;
      }
      int sumStream = numbers.stream().reduce(0, (x,y) -> x+y);
      int sumStream2 = numbers.stream().reduce(0, Integer::sum);
      int parallelSumStream2 = numbers.parallelStream().reduce(0, Integer::sum);
      System.out.println("Stream1: " + sumStream + " Stream2: " + sumStream2 + " Parallal Stream: " + parallelSumStream2);
    }
  }
}

class Widget {
  private Color color;
  private int weight;
  Widget(Color _color, int _weight) {
    color = _color;
    weight = _weight;
  }

  Color getColor() {
    return color;
  }

  int getWeight() {
    return weight;
  }
}

enum Color {
  RED, BLUE, GREEN
}