/**
 * Simple class for running a command and piping the output to a stream.
 */
import child_process = require('child_process');

export function runCommand(command: string, args: string[],
  options: {cwd?: string}, stdoutCb: (data: NodeBuffer) => void,
  stderrCb: (data: NodeBuffer) => void, cb: (exitCode: number) => void) {
  var cp = child_process.spawn(command, args, options);
  cp.stdout.on('data', stdoutCb);
  cp.stderr.on('data', stderrCb);
  cp.on('close', cb);
}

// Common-case callbacks

export function nopCb(data: NodeBuffer) {}
export function createWriteCb(stream: WritableStream) {
  return function(data: NodeBuffer) {
    stream.write(data);
  };
}
/**
 * Closes the given stream when called, and throws a fatal error if the command
 * returns an error code.
 * Calls 'done' if it succeeds.
 */
export function createErrorCb(grunt: IGrunt, stream: WritableStream,
  done: (status?: boolean) => void, errorMsg: string): (exitCode: number) => void {
  return function(exitCode: number) {
    stream.end();
    if (exitCode !== 0) {
      grunt.fail.fatal(errorMsg);
    }
    done();
  };
}
