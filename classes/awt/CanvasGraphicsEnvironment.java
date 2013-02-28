package classes.awt;

import java.awt.*;
import java.awt.image.BufferedImage;
import sun.awt.*;
import sun.java2d.*;
import classes.awt.canvas.CFontConfiguration;

public class CanvasGraphicsEnvironment extends SunGraphicsEnvironment {
    public native GraphicsDevice[] getScreenDevices()
        throws HeadlessException;

    public native GraphicsDevice getDefaultScreenDevice()
        throws HeadlessException;

    public native Font[] getAllFonts();

    public native String[] getAvailableFontFamilyNames();

    protected int getNumScreens() { return 1; }
    protected native GraphicsDevice makeScreenDevice(int screennum);
    protected FontConfiguration createFontConfiguration() {
        return createFontConfiguration(true, true);
    }

    public FontConfiguration
        createFontConfiguration(boolean preferLocaleFonts,
                                boolean preferPropFonts) {
        return new CFontConfiguration(this);
    }
}
