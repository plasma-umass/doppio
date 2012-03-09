package test;

public class DivideByZero {
    public static void main(String[] args) {
        int a = 1;
        int b = 0;
        try {
            int c = a / b;
        }
        catch (ArithmeticException e) {
            System.out.println("Caught ArithmeticException as expected: " + e.getMessage());
        }

        int d = b / a;
        System.out.println("This division should not throw.");
    }
}
