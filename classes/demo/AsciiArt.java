package classes.demo;

import java.io.*;
import java.awt.*;
import java.awt.image.*;
import javax.imageio.*;

public class AsciiArt {
  static final int WIDTH = 80;
  static final int HEIGHT = 24;
  static final int FONT_SIZE = 16;

  public static void main(String[] args) {
    if (args.length == 0) {
      System.out.println("Usage: AsciiArt <some text>");
      return;
    }
    BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
    Graphics g = image.getGraphics();
    g.setFont(new Font("Dialog", Font.PLAIN, FONT_SIZE));
    Graphics2D graphics = (Graphics2D) g;
    //graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    graphics.drawString(args[0], 0, HEIGHT);
    for (int y = 0; y < HEIGHT; y++) {
      StringBuilder sb = new StringBuilder();
      int lastDot = -1;
      for (int x = 0; x < WIDTH; x++) {
        int pixVal = image.getRGB(x, y);
        if (pixVal == -16777216) {
          sb.append(" ");
        } else if (pixVal == -1) {
          sb.append("#");
          lastDot = x;
        } else {
          sb.append("*");
          lastDot = x;
        }
      }
      if (lastDot > -1)
        System.out.println(sb.substring(0, lastDot));
    }
  }
}
