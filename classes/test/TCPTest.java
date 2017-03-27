/**
 * A simple TCP client that sends a string of text to a server and waits for a response.
 * Adapted from http://systembash.com/content/a-simple-java-tcp-server-and-tcp-client/
 */
package classes.test;

import java.io.*;
import java.net.*;

class TCPTest {
  public static void main(String argv[]) throws Exception {
    // Note: We connect to TCPServer on a different port than it listens on
    // because WebSockify is actually responsible for receiving our WebSocket
    // messages on port 7001 and proxying them to TCPServer using a local
    // socket connection on port 7002.
    InetAddress address = InetAddress.getByName("localhost");
    System.out.println(address.getHostAddress());
    Socket clientSocket = new Socket("localhost", 7001);
    DataOutputStream outToServer = new DataOutputStream(clientSocket.getOutputStream());
    BufferedReader inFromServer = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
    String sentence = "Hello World!";
    outToServer.writeBytes(sentence + '\n');
    String modifiedSentence = inFromServer.readLine();
    System.out.println(modifiedSentence);
    outToServer.writeBytes("Second packet\n");
    System.out.println(inFromServer.readLine());
    clientSocket.close();
  }
}

