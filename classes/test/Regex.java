package classes.test;

import java.util.regex.Pattern;
import java.util.regex.Matcher;
 
public class Regex {
 
    private static final String REGEX = ":";
    private static final String INPUT =
        "one:two:three:four:five";
     
    public static void main(String[] args) {
        Pattern p = Pattern.compile(REGEX);
        String[] items = p.split(INPUT);
        for(String s : items) {
            System.out.println(s);
        }
    }
}
