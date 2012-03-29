/*The LZW Lib, Included as a part of the compression tutorial
 *Written By Martin Zolnieryk
 *
 *Thanks Goes to Mark Nelson and ever other person whos tutorials
 *aided in the writing of this.
 *
 *This code is freeware, however if you use this some credit
 *be nice.
 */

package test.special;

import java.io.*;

//This is the LZW Class
class Lzw
{
  final int BUFFERSIZE  = 32;
  final int CHARSIZE 	  = 8;
  //The actual LZW table
  boolean initStatus = false;
  short [] prefix; //The Prefix, first code
  short [] character;  //The char that is added to a code, always -1-255
  short codesUsed;    //How many CODES of Size are used
  short codesReserved; //Which codes not used, usually 0-255 for ASCII
  short lzwSize;      //Tells us how many LZW's were allocated
  long buffer;        //32 bits of space, up to 16bit compression, only 24 bits used
  int bufferBits;     //How many bits are stored in the buffer
  int bits;           //How many bits per code
  short bufferSize;   //Used for gif, and other possible lzw implentations
  short toNBuffer;    //Used for gif, how much before new buffer must be allocated
  short [] stringBuffer; //The string buffer

  //Doesnt do anything
  public Lzw ()
  {

  }
  //Contruct with init call
  public Lzw(int bits)
  {
    init(bits);
  }


  //Sets up library
  public void init (int bits)
  {
    prefix =  new short[1<<bits];
    character = new short[1<<bits];
    stringBuffer = new short[1<<bits];
    lzwSize =  (short)(1<<(bits)-1); //One less, becuase of 0 :)
    codesUsed = 0;
    codesReserved = 255;
    buffer = 0;
    bufferBits = 0;
    this.bits = bits;
    bufferSize = 0; //tells how big buffer chunks are
    toNBuffer = 0;
    initStatus = true;
    clearTable();
  }

  //Clears the table's values
  //Used mainly for gif clearing
  public void clearTable()
  {
    if(initStatus)
    {
      for(int looper = 0; looper < lzwSize+1; looper++)
      {
        prefix[looper] = 0; 
        character[looper] = -1; //Would use 0, but NULL uses it
        stringBuffer[looper] = 0;
      }
    }
  }

  //Does a complete clean up
  public void clearTableFull(int bits)
  {
    //Some Error Checking
    if(initStatus)
    {
      //Clear Table
      clearTable();
      codesUsed = 0;
      codesReserved = 255;
      buffer = 0;
      bufferBits = 0;
      this.bits = bits;
      bufferSize = 0; //tells how big buffer chunks are
      toNBuffer = 0;
    }
  }



  //This writes a code to a file, really cool stuff.
  //We support a max of 16 bit compression
  private int writeCode(OutputStream fp,int code)
  {

    if(!initStatus)
      return -1;
    //Some bit manipulation
    buffer |= code << (bufferBits);
    bufferBits+=bits;
    while(bufferBits >=CHARSIZE)//Never go less than 8 or we loose data
    {
      try{
        fp.write((byte)buffer); //Only write the first 8 bits
      }
      catch(IOException e)
      {
        System.out.println("write error"+ e.getMessage());
      }
      buffer >>>=CHARSIZE; //Remove the byte from the buffer
      bufferBits-= CHARSIZE; //Buffer now stores one less byte
    }
    return 0;
  }




  //Flushes if anything left
  private void flushWriteCode(OutputStream fp)
  {
    if(initStatus)
      if(bufferBits > 0)
        writeCode(fp, 0);
  }

  //This gets a gif code from the file
  //this time, we work backwards
  private int getCode(InputStream fp)
  {
    long temp;
    //int test;
    if(!initStatus)
      return 0;
    while(bufferBits <=(BUFFERSIZE - CHARSIZE *2))//Never go over than size - or we loose data
    {											  //Also never use full 64 bits, to avoid issues
      //No point reading anymore, files done :p
      try
      {
        if(fp.available() <= 0)
          break;

        //test = fp.read();
        //buffer |= test << bufferBits;
        buffer |= fp.read() <<(bufferBits);
        bufferBits+= CHARSIZE; //Buffer now stores one more char.


      }

      catch(IOException e)
      {
        System.out.println("Error in getCode" + e.getMessage());
      }
    }
    temp = (buffer << (64-bits)) >>> (64-bits); //We remove the excess bits
    buffer >>>= bits; //Remove the bits from buffer
    bufferBits -= bits;
    return (int)temp; //we return the correct code
  }




  //This is a little handy tool that returns the string
  //Corrosponding to the appropriate string ID.
  //Returns the size of the string
  int getString(int codeNumber)
  {
    int looper = 0;
    if(!initStatus)
      return -1;
    while(codeNumber > codesReserved)
    { 
      stringBuffer[looper] = character[codeNumber];
      codeNumber = prefix[codeNumber];
      looper++; 
    }
    stringBuffer[looper] = (short)codeNumber;
    looper++;
    stringBuffer[looper] = '\0'; //End of string
    return looper;
  }



  //This formula is really easy to understand
  //Simply Does a brute-force search throught the entire table
  //However, it is optimized not to look at lower code values then itself
  int findCode(int stringBuffer, int character)
  {
    if(!initStatus)
      return -1;
    //The Search
    for(int looper = stringBuffer; looper <= codesUsed+codesReserved;looper++)
    {
      //If we find a match
      if(stringBuffer == prefix[looper] && character == this.character[looper])
        return looper;
    }
    //If not we return the next available code 
    return codesUsed + 1 +codesReserved;
  }



  //Self Explantory, compresses a file
  public int compressFile(String in, String out)
  {
    BufferedInputStream fileIn;
    BufferedOutputStream fileOut;

    int nextChar = 0;      //Check psuedo code, grabs next char
    int stringBuffer = 0;  //Check the psuedo code, hold string info
    int codeNumber = 0;    //Holds code value for STRING_BUFFER
    boolean written = false;
    if(!initStatus)
      return -1;

    //We try to load the file
    try
    {
      fileIn = new BufferedInputStream (new FileInputStream (in));
      fileOut = new BufferedOutputStream(new FileOutputStream(out));
      clearTableFull(bits);
      stringBuffer=fileIn.read();  //Get the first code
    }
    catch(IOException e)
    {
      System.out.println("Unable to load file " + e.getMessage());
      return -1;
    }

    try{
      while((nextChar = fileIn.read())!= -1) //End when the file is finished
      {
        //get next code
        codeNumber = findCode(stringBuffer,nextChar); //look for entry
        if (character[codeNumber] != -1)  //If its in the table
        {

          stringBuffer= codeNumber;     
          written = false;
        }
        else   //If its not in the table
        {                                      
          //We can only add new entries if the table is not full  
          if (codesUsed+ codesReserved < lzwSize-1)
          {
            prefix[codeNumber]= (short)stringBuffer;
            character[codeNumber]=(short)nextChar;
            codesUsed++;
          }

          //We write the code
          writeCode(fileOut,stringBuffer);
          written = true;
          //Start again
          stringBuffer=nextChar;     
        }                                
      }                                  
    }
    catch(IOException e){System.out.println("Error in compressFile" +e.getMessage());}
    //Make sure we didnt forget to write one last code
    if(!written)
      writeCode(fileOut,stringBuffer);
    //This is our little way of saying the file is finished, this code number
    //is not used
    writeCode(fileOut,lzwSize); //ENDOFFILE
    //Will flush the buffer if any codes need to be flushed
    flushWriteCode(fileOut);
    //Close Files
    try
    {
      fileIn.close();
      fileOut.close();
    }
    catch(IOException e){System.out.println("Couldnt close files " +e.getMessage());}
    return 0;
  }



  //Does the oposite of the routine above
  int decompressFile(String in, String out)
  {
    BufferedInputStream fileIn;
    BufferedOutputStream fileOut;
    int looper;
    int firstCode = -1;      //Check psuedo code, is the previous code
    int nextCode = 0;  //Name is self explanatory   
    int firstChar = 0;      //Is used if the code is not in the table

    if(!initStatus) //
      return -1;
    //Load Files
    try
    {
      fileIn = new BufferedInputStream (new FileInputStream (in));
      fileOut = new BufferedOutputStream(new FileOutputStream(out));
      clearTableFull(bits);
    }
    catch(IOException e)
    {
      System.out.println("Unable to load file " + e.getMessage());
      return -1;
    }

    clearTableFull(bits);
    //Do the initialization
    firstCode = getCode(fileIn);
    firstChar = firstCode;         

    try{
      fileOut.write(firstCode);
      //We start the main loop
      while((nextCode = getCode(fileIn))!= lzwSize) {

        //This is some error checking, basically
        //If a the buffer is empty, and the file is finshed, exit!
        if(nextCode == -1)
        {
          if(bufferBits == 0)
            break;
        }  
        //If not in table
        if (nextCode > codesUsed + codesReserved) {
          codesUsed++;
          prefix[nextCode]= (short)firstCode;
          character[nextCode]=(short)firstChar;
          looper = getString(nextCode);
        }
        //If the code was already in the table
        //See if we can add a new code to the table
        //Make sure we have not gone over the table size
        else if(codesUsed + codesReserved < lzwSize ) {                                       
          looper = getString(nextCode);
          codesUsed++;
          prefix[codesUsed +codesReserved]= (short)firstCode;
          character[codesUsed +codesReserved]=stringBuffer[looper-1];
        }
        else //Normal 0-255 ascii char
          looper = getString(nextCode);


        //We write out the decompressed code to the file
        firstChar = stringBuffer[looper-1];    
        firstCode = nextCode;

        while(looper > 0) {
          fileOut.write(stringBuffer[looper-1]);
          fileOut.flush();
          looper--;
        }
      } 
    }
    catch(IOException e){System.out.println("Error in decompressFile" + e.getMessage());
    }

    //Close Files
    try {
      fileIn.close();
      fileOut.close();
    }
    catch(IOException e){System.out.println("Couldnt close files" +e.getMessage());}

    return 0;
  }


  public static void main(String[] args) {
    if (args.length < 3) {
      System.out.println("Usage: [c|d] <infile> <outfile>");
      return;
    }

    Lzw lzNew = new Lzw(12);
    if (args[0].equals("c"))
      lzNew.compressFile(args[1],args[2]);
    else if (args[0].equals("d"))
      lzNew.decompressFile(args[1],args[2]);
    else
      System.out.println("Unrecognized option!");
  }

}
