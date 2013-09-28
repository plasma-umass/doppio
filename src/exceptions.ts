/// <amd-dependency path="../vendor/underscore/underscore" />
"use strict";
var underscore = require('../vendor/underscore/underscore');
import logging = require('./logging');
import runtime = require('./runtime');
import java_object = require('./java_object');
import opcodes = require('./opcodes');
import attributes = require('./attributes');
import threading = require('./threading');
var debug = logging.debug;

export interface DoppioException {
  toplevel_catch_handler(rs: runtime.RuntimeState): void
}

export class HaltException implements DoppioException {
  constructor(public exit_code: number) {}

  public toplevel_catch_handler(): void {
    if (this.exit_code !== 0) {
      return logging.error("\nExited with code " + this.exit_code);
    }
  }
}

export var ReturnException = 'RETURNEXCEPTION';

export class YieldException {
  constructor(public condition: any) {}
}

export class YieldIOException extends YieldException {}
  // Empty class

export class JavaException implements DoppioException {
  constructor(public exception: java_object.JavaObject) {}

  public method_catch_handler(rs: runtime.RuntimeState, cf: threading.StackFrame, top_of_stack: boolean): boolean {
    var method = cf.method;
    if (!top_of_stack && method.has_bytecode) {
      cf.pc -= 3;  // rewind the invoke opcode
      var op: opcodes.Opcode;
      while (!(cf.pc <= 0 || (((op = method.code.opcodes[cf.pc]) != null) && op.name.match(/^invoke/)))) {
        --cf.pc;
      }
    }

    // Switch the native frame's runner to its error handler, if it exists.
    if (cf["native"]) {
      if (cf.error != null) {
        cf.runner = () => cf.error(this);
        return true;
      }
      return false;
    }
    var exception_handlers = method.code.exception_handlers;
    var ecls = this.exception.cls;

    var handler = underscore.find(exception_handlers, function(eh: attributes.ExceptionHandler): boolean {
      // XXX: Kludge. If the class is not loaded, then it is not possible for this to be the correct exception handler
      return (eh.start_pc <= cf.pc && cf.pc < eh.end_pc) && (method.cls.loader.get_resolved_class(eh.catch_type, true) != null) && (eh.catch_type === "<any>" || ecls.is_castable(method.cls.loader.get_resolved_class(eh.catch_type)));
    });


    if (handler != null) {
      debug("caught " + this.exception.cls.get_type() + " in " + method.full_signature() + " as subclass of " + handler.catch_type);
      cf.stack = [this.exception];  // clear out anything on the stack; it was made during the try block
      cf.pc = handler.handler_pc;
      return true;
    }
    // abrupt method invocation completion
    debug("exception not caught, terminating " + method.full_signature());
    return false;
  }

  public toplevel_catch_handler(rs: runtime.RuntimeState): void {
    debug("\nUncaught " + this.exception.cls.get_type());
    var msg = this.exception.get_field(rs, 'Ljava/lang/Throwable;detailMessage');
    if (msg != null) {
      debug("\t" + msg.jvm2js_str());
    }
    rs.push2(rs.curr_thread, this.exception);
    var thread_cls = rs.get_bs_class('Ljava/lang/Thread;');
    var dispatch_method = thread_cls.method_lookup(rs, 'dispatchUncaughtException(Ljava/lang/Throwable;)V');
    dispatch_method.setup_stack(rs);
  }
}
