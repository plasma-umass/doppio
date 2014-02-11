/**
 * A simple TCP client that sends a string of text to a server and waits for a response.
 * Adapted from http://systembash.com/content/a-simple-java-tcp-server-and-tcp-client/
 */
package classes.demo;

import java.io.*;
import java.net.*;

class TCPClient {
  public static void main(String argv[]) throws Exception {
    String sentence;
    String modifiedSentence;
    BufferedReader inFromUser = new BufferedReader(new InputStreamReader(System.in));
    // Note: We connect to TCPServer on a different port than it listens on
    // because WebSockify is actually responsible for receiving our WebSocket
    // messages on port 6789 and proxying them to TCPServer using a local
    // socket connection on port 6790.
    Socket clientSocket = new Socket("localhost", 6789);
    DataOutputStream outToServer = new DataOutputStream(clientSocket.getOutputStream());
    BufferedReader inFromServer = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
    sentence = inFromUser.readLine();
    outToServer.writeBytes(sentence + '\n');
    modifiedSentence = inFromServer.readLine();
    System.out.println("FROM SERVER: " + modifiedSentence);
    clientSocket.close();
  }
}

