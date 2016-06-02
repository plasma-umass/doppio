/**
 * A simple TCP server that capitalizes and sends back lines of text sent to it.
 * Adapted from http://systembash.com/content/a-simple-java-tcp-server-and-tcp-client/
 */
package classes.util;

import java.io.*;
import java.net.*;

class TCPServer {
  public static void main(String argv[]) throws Exception {
    String clientSentence;
    String capitalizedSentence;
    ServerSocket welcomeSocket = new ServerSocket(argv.length > 0 && argv[0].equals("doppio") ? 6790 : 6789);
    Runtime.getRuntime().addShutdownHook(new Thread() {
      @Override
      public void run() {
        try {
          welcomeSocket.close();
        } catch (IOException e) {
        }
      }
    });

    while(true) {
      try {
        Socket connectionSocket = welcomeSocket.accept();
        BufferedReader inFromClient =
            new BufferedReader(new InputStreamReader(connectionSocket.getInputStream()));
        DataOutputStream outToClient = new DataOutputStream(connectionSocket.getOutputStream());
        clientSentence = inFromClient.readLine();
        capitalizedSentence = clientSentence.toUpperCase() + '\n';
        outToClient.writeBytes(capitalizedSentence);
      } catch (Throwable t) {}
    }
  }
}
