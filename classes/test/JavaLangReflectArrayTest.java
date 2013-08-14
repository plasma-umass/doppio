package classes.test;
 import static java.lang.reflect.Array.*;
 import java.math.BigInteger;
public class JavaLangReflectArrayTest {
   public static void main(String[] args) {
      try {
          int[] intArray = new int[] {10,20,30};
          
           Object value1a = (Integer)get(new int[] {100,200,300}, 1);
           String value1b = (String)get(new String[] {"a","b","c"}, 2);
           System.out.println(value1a);
           System.out.println(value1b);
           


           boolean value2= getBoolean(new boolean[] {true,false}, 1);
           System.out.println(value2);
           
           byte value3=getByte(new byte[] {13,14,15}, 2);
           System.out.println(value3);
           
           
           char value4=getChar(new char[] {'a','b','c'}, 2);
           System.out.println(value4);
           
           
           double value5=getDouble(new double[] {20., 21.,22.,23.}, 1);
           System.out.println(value5);
           
           float value6=getFloat(new float[] {53f,54f,55f},2);
           System.out.println(value6);

           int value7=getInt(new int[] {10,20,30}, 2);
           System.out.print(value7);
           
           int len=getLength(new int[] {55,44,33,22,11});
           System.out.print(len);
           
           long value8=getLong(new long[] {10,20,300},2);
           System.out.print(value8);
           
           short value9=getShort(new short[] {42,41}, 1);
           System.out.println(value9);
           
           //Object array1 = newInstance(Class<?> componentType, int... dimensions)
           Class<?> c = Class.forName("java.math.BigInteger");
          BigInteger[] myArray =  (BigInteger[]) newInstance(c, 100);
           myArray[99] = BigInteger.ONE;
           System.out.println(myArray[99]);



           BigInteger[][][] myArrayB =  (BigInteger[][][]) newInstance(c, 3,4,5);
            myArrayB[2][3][4] = BigInteger.ONE;
            System.out.println(myArrayB[2][3][4]);


          String[] s = new String[] {"A","B","C"};
          boolean[] b = new boolean[5];
          byte[]bytes = new byte[20];
          char[] chars = new char[7];
          float[] floats = new float[] {7f,8f};
          double[] doubles = new double[] {7f,8f,9f,10f};
          long[] longs = new long[5];
          short[] shorts = new short[6];
          int[] ints = new int[60];
          set(s,1,"Hi");
          
          setBoolean(b, 3, true);
          
          setByte(bytes, 2, (byte)98);
          System.out.println(bytes[2]);
          
          setChar(chars,1, 'H');
          System.out.println(chars[1]);
          
          setDouble(doubles, 2, 42.5);
          System.out.println(doubles[2]);

          setFloat(floats, 1,16f);
          System.out.println(floats[1]);

          setInt(ints, ints.length-1,9753);
          System.out.println(ints[ints.length-1]);
          
          setLong(longs, 3, 3572);
          System.out.println(longs[3]);
          
          setShort(shorts ,5, (short) 0x7182);
          System.out.println(shorts[5]);
      } catch(Exception e) {
        System.out.println("Threw " + e);
      }
   }
}


