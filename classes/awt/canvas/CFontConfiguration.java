package classes.awt.canvas;

import java.nio.charset.Charset;
import sun.java2d.SunGraphicsEnvironment;
import sun.awt.FontConfiguration;

public class CFontConfiguration extends FontConfiguration {
    public CFontConfiguration(SunGraphicsEnvironment env) {
        super(env);
    }
    /**
     * Returns a fallback name for the given font name. For a few known
     * font names, matching logical font names are returned. For all
     * other font names, defaultFallback is returned.
     * defaultFallback differs between AWT and 2D.
     */
    public native String getFallbackFamilyName(String fontName, String defaultFallback);

    /* Platform-specific mappings */
    protected native void initReorderMap();

    /**
     * Returns the java.io name of the platform character encoding for the
     * given AWT font name and character subset. May return "default"
     * to indicate that getDefaultFontCharset should be called to obtain
     * a charset encoder.
     */
    protected native String getEncoding(String awtFontName, String characterSubsetName);

    protected native Charset getDefaultFontCharset( String fontName);

    protected String getFaceNameFromComponentFontName(String componentFontName) {
        return "sans";
    }

    protected String getFileNameFromComponentFontName(String componentFontName) {
        return "/usr/X11/lib/fonts/foo.ttf";
    }
}

