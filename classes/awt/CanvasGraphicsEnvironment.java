package classes.awt;

import java.awt.*;
import java.awt.image.BufferedImage;
import sun.awt.*;
import sun.java2d.*;

public class CanvasGraphicsEnvironment extends SunGraphicsEnvironment {
    public native GraphicsDevice[] getScreenDevices()
        throws HeadlessException;

    public native GraphicsDevice getDefaultScreenDevice()
        throws HeadlessException;

    public native Graphics2D createGraphics(BufferedImage img);

    public native Font[] getAllFonts();

    public native String[] getAvailableFontFamilyNames();

    protected int getNumScreens() { return 1; }
    protected native GraphicsDevice makeScreenDevice(int screennum);
    protected native FontConfiguration createFontConfiguration();

    public FontConfiguration createFontConfiguration(boolean preferLocaleFonts,
                                                     boolean preferPropFonts) {
      // ignore arguments for simplicity
      return createFontConfiguration();
    }

    public boolean isDisplayLocal() { return true; }
}
