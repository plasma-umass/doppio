"use strict";
import path = require('path');
import fs = require('fs');
import gLong = require('./gLong');
import util = require('./util');
import attributes = require('./attributes');
import runtime = require('./runtime');
import java_object = require('./java_object');
var JavaObject = java_object.JavaObject, JavaArray = java_object.JavaArray;
import exceptions = require('./exceptions');
import logging = require('./logging');
import threading = require('./threading');
var debug = logging.debug, error = logging.error, trace = logging.trace;

// For types; shouldn't actually be used.
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');

declare var Websock;
declare var setImmediate;
import ClassData = require('./ClassData');

// XXX: Avoids a tough circular dependency
// ClassData->methods->natives->...
// Dependency occurs due to instanceof checks.
var ReferenceClassData, PrimitiveClassData, ArrayClassData;
export var instantiated: boolean = false;
export function instantiate(rcd, pcd, acd) {
  ReferenceClassData = rcd;
  PrimitiveClassData = pcd;
  ArrayClassData = acd;
  instantiated = true;
}

// convenience function. idea taken from coffeescript's grammar
function o(fn_name: string, fn: Function): { fn_name: string; fn: Function} {
  return {
    fn_name: fn_name,
    fn: fn
  };
}

export var trapped_methods = {
  java: {
    nio: {
      Bits: [
        o('byteOrder()L!/!/ByteOrder;', function(rs:runtime.RuntimeState): java_object.JavaObject {
          var cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/nio/ByteOrder;');
          return cls.static_get(rs, 'LITTLE_ENDIAN');
        }), o('copyToByteArray(JLjava/lang/Object;JJ)V', function(rs: runtime.RuntimeState, srcAddr: gLong, dst: java_object.JavaArray, dstPos: gLong, length: gLong): void {
          unsafe_memcpy(rs, null, srcAddr, dst, dstPos, length);
        })
      ],
      charset: {
        Charset$3: [
          // this is trapped and NOP'ed for speed
          o('run()L!/lang/Object;', function(rs: runtime.RuntimeState): java_object.JavaObject {
            return null;
          })
        ]
      }
    }
  }
};

function doPrivileged(rs: runtime.RuntimeState, action: methods.Method): void {
  var my_sf = rs.curr_frame();
  var m = action.cls.method_lookup(rs, 'run()Ljava/lang/Object;');
  if (m != null) {
    if (!m.access_flags["static"]) {
      rs.push(action);
    }
    m.setup_stack(rs);
    my_sf.runner = function () {
      var rv = rs.pop();
      rs.meta_stack().pop();
      rs.push(rv);
    };
    throw exceptions.ReturnException;
  } else {
    rs.async_op(function (resume_cb, except_cb) {
      action.cls.resolve_method(rs, 'run()Ljava/lang/Object;', (function () {
        rs.meta_stack().push(<any>{}); // dummy
        resume_cb();
      }), except_cb);
    });
  }
}

function unsafe_memcpy(rs: runtime.RuntimeState, src_base: java_object.JavaArray, src_offset_l: gLong, dest_base: java_object.JavaArray, dest_offset_l: gLong, num_bytes_l: gLong): void {
  // XXX assumes base object is an array if non-null
  // TODO: optimize by copying chunks at a time
  var num_bytes = num_bytes_l.toNumber();
  if (src_base != null) {
    var src_offset = src_offset_l.toNumber();
    if (dest_base != null) {
      // both are java arrays
      return java_object.arraycopy_no_check(src_base, src_offset, dest_base, dest_offset_l.toNumber(), num_bytes);
    } else {
      // src is an array, dest is a mem block
      var dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr].setInt8(i, src_base.array[src_offset + i]);
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr + i] = src_base.array[src_offset + i];
        }
      }
    }
  } else {
    var src_addr = rs.block_addr(src_offset_l);
    if (dest_base != null) {
      // src is a mem block, dest is an array
      var dest_offset = dest_offset_l.toNumber();
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr].getInt8(i);
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr + i];
        }
      }
    } else {
      // both are mem blocks
      var dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr].setInt8(i, rs.mem_blocks[src_addr].getInt8(i));
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr + i] = rs.mem_blocks[src_addr + i];
        }
      }
    }
  }
}

function get_caller_class(rs: runtime.RuntimeState, frames_to_skip: number): java_object.JavaClassObject {
  var caller, cls;

  caller = rs.meta_stack().get_caller(frames_to_skip);
  // Note: disregard frames associated with
  //   java.lang.reflect.Method.invoke() and its implementation.
  if (caller.name.indexOf('Ljava/lang/reflect/Method;::invoke') === 0) {
    caller = rs.meta_stack().get_caller(frames_to_skip + 1);
  }
  cls = caller.method.cls;
  return cls.get_class_object(rs);
}

export var native_methods = {
  classes: {
    awt: {
      CanvasGraphicsEnvironment: []
      // TODO: implement this
      // o 'createFontConfiguration()Lsun/awt/FontConfiguration;', (rs) ->
    },
    doppio: {
      JavaScript: [
        o('eval(Ljava/lang/String;)Ljava/lang/String;', function (rs: runtime.RuntimeState, to_eval: java_object.JavaObject): java_object.JavaObject {
          var rv = eval(to_eval.jvm2js_str());
          // Coerce to string, if possible.
          if (rv != null) {
            return rs.init_string("" + rv);
          } else {
            return null;
          }
        })
      ],
      Debug: [
        o('SetLogLevel(L!/!/!$LogLevel;)V', function(rs, loglevel) {
          logging.log_level = loglevel.get_field(rs, 'Lclasses/doppio/Debug$LogLevel;level');
        }), o('GetLogLevel()L!/!/!$LogLevel;', function(rs) {
          var ll_cls = rs.get_bs_class('Lclasses/doppio/Debug$LogLevel;');
          switch (logging.log_level) {
            case 10:
              return ll_cls.static_get(rs, 'VTRACE');
            case 9:
              return ll_cls.static_get(rs, 'TRACE');
            case 5:
              return ll_cls.static_get(rs, 'DEBUG');
            default:
              return ll_cls.static_get(rs, 'ERROR');
          }
        })
      ]
    }
  },
  java: {
    security: {
      AccessController: [
        o('doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('getStackAccessControlContext()Ljava/security/AccessControlContext;', function(rs) {
          return null;
        })
      ]
    },
    net: {}
  },
  sun: {
    font: {
      FontManager: [],
        // TODO: this may be a no-op, but may be important
        // o 'getFontConfig(Ljava/lang/String;[Lsun/font/FontManager$FontConfigInfo;)V', ->
      FreetypeFontScaler: [o('initIDs(Ljava/lang/Class;)V', function() {})],
      StrikeCache: [
        o('getGlyphCacheDescription([J)V', function(rs, infoArray) {
          // XXX: these are guesses, see the javadoc for full descriptions of the infoArray
          infoArray.array[0] = gLong.fromInt(8);        // size of a pointer
          return infoArray.array[1] = gLong.fromInt(8); // size of a glyphInfo
        })
      ]
    },
    management: {
      VMManagementImpl: [
        o('getStartupTime()J', function(rs) {
          return rs.startup_time;
        }), o('getVersion0()Ljava/lang/String;', function(rs) {
          return rs.init_string("1.2", true);
        }), o('initOptionalSupportFields()V', function(rs) {
          var field_names, name, vm_management_impl, _i, _len, _results;
          // set everything to false
          field_names = ['compTimeMonitoringSupport', 'threadContentionMonitoringSupport', 'currentThreadCpuTimeSupport', 'otherThreadCpuTimeSupport', 'bootClassPathSupport', 'objectMonitorUsageSupport', 'synchronizerUsageSupport'];
          vm_management_impl = rs.get_bs_class('Lsun/management/VMManagementImpl;');
          _results = [];
          for (_i = 0, _len = field_names.length; _i < _len; _i++) {
            name = field_names[_i];
            _results.push(vm_management_impl.static_put(rs, name, 0));
          }
          return _results;
        }), o('isThreadContentionMonitoringEnabled()Z', function() {
          return false;
        }), o('isThreadCpuTimeEnabled()Z', function() {
          return false;
        }), o('getAvailableProcessors()I', function() {
          return 1;
        }), o('getProcessId()I', function() {
          return 1;
        })
      ],
      MemoryImpl: [
        o('getMemoryManagers0()[Ljava/lang/management/MemoryManagerMXBean;', function(rs) {
          // XXX may want to revisit this 'NOP'
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryManagerImpl;'), []);
        }), o('getMemoryPools0()[Ljava/lang/management/MemoryPoolMXBean;', function(rs) {
          // XXX may want to revisit this 'NOP'
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryPoolImpl;'), []);
        })
      ]
    },
    net: {
      spi: {}
    },
    nio: {
      ch: {
        FileChannelImpl: [
          // this poorly-named method actually specifies the page size for mmap
          // This is the Mac name for sun/misc/Unsafe::pageSize. Apparently they
          // wanted to ensure page sizes can be > 2GB...
          o('initIDs()J', function(rs) {
            // arbitrary
            return gLong.fromNumber(1024);
          }),
          // Reports this file's size
          o('size0(Ljava/io/FileDescriptor;)J', function(rs, _this, fd_obj) {
            var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
            rs.async_op(function(cb, e_cb) {
                fs.fstat(fd, function(err, stats) {
                    if (null != err)
                      e_cb(function() { rs.java_throw(rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor."); });
                    cb(gLong.fromNumber(stats.size));
                });
            });
          }), o('position0(Ljava/io/FileDescriptor;J)J', function(rs, _this, fd, offset) {
            var parent;

            parent = _this.get_field(rs, 'Lsun/nio/ch/FileChannelImpl;parent');
            return gLong.fromNumber(offset.equals(gLong.NEG_ONE) ? parent.$pos : parent.$pos = offset.toNumber());
          })
        ],
        FileDispatcher: [
          o('init()V', function(rs) {}), // NOP
          o('read0(Ljava/io/FileDescriptor;JI)I', function(rs, fd_obj, address, len) {
            var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
            // read upto len bytes and store into mmap'd buffer at address
            var block_addr = rs.block_addr(address);
            var buf = new Buffer(len);
            rs.async_op(function(cb) {
                fs.read(fd, buf, 0, len, 0, function(err, bytes_read) {
                    var i, _i, _j;
                    if ("undefined" != typeof DataView && null !== DataView)
                      for (i = 0; bytes_read > i; i++)
                        rs.mem_blocks[block_addr].setInt8(i, buf.readInt8(i));
                    else
                      for (i = 0; bytes_read > i; i++)
                        rs.mem_blocks[block_addr + i] = buf.readInt8(i);
                    cb(bytes_read);
                });
            });
          }),
          // NOP, I think the actual fs.close is called later. If not, NBD.
          o('preClose0(Ljava/io/FileDescriptor;)V', function(rs, fd_obj) {})
        ],
        NativeThread: [
          o("init()V", function(rs) {}), // NOP
          o("current()J", function(rs) {
            // -1 means that we do not require signaling according to the
            // docs.
            return gLong.fromNumber(-1);
          })
        ]
      }
    }
  }
};


native_methods['java']['net']['Inet4Address'] = [o('init()V', function(rs) {})];

var host_lookup = {};

var host_reverse_lookup = {};

// 240.0.0.0 .. 250.0.0.0 is currently unused address space
var next_host_address = 0xF0000000;

function next_address() {
  next_host_address++;
  if (next_host_address > 0xFA000000) {
    error('Out of addresses');
    next_host_address = 0xF0000000;
  }
  return next_host_address;
}

function pack_address(address) {
  var i, ret, _i;

  ret = 0;
  for (i = _i = 3; _i >= 0; i = _i += -1) {
    ret |= address[i] & 0xFF;
    ret <<= 8;
  }
  return ret;
}

function host_allocate_address(address) {
  var ret;

  ret = next_address();
  host_lookup[ret] = address;
  host_reverse_lookup[address] = ret;
  return ret;
}

native_methods['java']['net']['Inet4AddressImpl'] = [
  o('lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;', function(rs, _this, hostname) {
    var cdata, cons, failure, success;

    cdata = rs.get_class('Ljava/net/Inet4Address;');
    success = function(rv, success_cb, except_cb) {
      return success_cb(new JavaArray(rs, rs.get_bs_class('[Ljava/net/InetAddress;'), [rv]));
    };
    failure = function(e_cb, success_cb, except_cb) {
      return except_cb(e_cb);
    };
    cons = cdata.method_lookup(rs, '<init>(Ljava/lang/String;I)V');
    return rs.call_bytecode(cdata, cons, [hostname, host_allocate_address(hostname.jvm2js_str())], success, failure);
  }), o('getLocalHostName()Ljava/lang/String;', function(rs, _this) {
    return rs.init_string('localhost');
  }), o('getHostByAddr([B)Ljava/lang/String;', function(rs, _this, addr) {
    var ret;

    ret = host_reverse_lookup[pack_address(addr.array)];
    if (ret === void 0) {
      return null;
    }
    return rs.init_string(ret);
  }), o('isReachable0([BI[BI)Z', function(rs, _this, addr, scope, timeout, inf, ttl, if_scope) {
    return false;
  })
];

native_methods['java']['net']['Inet6Address'] = [o('init()V', function(rs) {})];

native_methods['java']['net']['InetAddress'] = [o('init()V', function(rs) {})];

native_methods['java']['net']['InetAddressImplFactory'] = [
  o('isIPv6Supported()Z', function(rs) {
    return false;
  })
];

// See RFC 6455 section 7.4
function websocket_status_to_message(status) {
  switch (status) {
    case 1000:
      return 'Normal closure';
    case 1001:
      return 'Endpoint is going away';
    case 1002:
      return 'WebSocket protocol error';
    case 1003:
      return 'Server received invalid data';
  }
  return 'Unknown status code or error';
}

native_methods['java']['net']['PlainSocketImpl'] = [
  o('socketCreate(Z)V', function(rs, _this, isServer) {
    var fd;

    // Check to make sure we're in a browser and the websocket libraries are present
    if (!util.are_in_browser()) {
      rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets are disabled');
    }
    fd = _this.get_field(rs, 'Ljava/net/SocketImpl;fd');
    // Make the FileDescriptor valid with a dummy fd
    fd.set_field(rs, 'Ljava/io/FileDescriptor;fd', 8374);
    // Finally, create our websocket instance
    _this.$ws = new Websock();
    return _this.$is_shutdown = false;
  }), o('socketConnect(Ljava/net/InetAddress;II)V', function(rs, _this, address, port, timeout) {
    var addy, holder, host, i, shift, _i;
    // The IPv4 case
    holder = address.get_field(rs, 'Ljava/net/InetAddress;holder');
    addy = holder.get_field(rs, 'Ljava/net/InetAddress$InetAddressHolder;address');
    // Assume scheme is ws for now
    host = 'ws://';
    if (host_lookup[addy] === void 0) {
      // Populate host string based off of IP address
      for (i = _i = 3; _i >= 0; i = _i += -1) {
        shift = i * 8;
        host += "" + ((addy & (0xFF << shift)) >>> shift) + ".";
      }
      // trim last '.'
      host = host.substring(0, host.length - 1);
    } else {
      host += host_lookup[addy];
    }
    // Add port
    host += ":" + port;
    debug("Connecting to " + host + " with timeout = " + timeout + " ms");
    return rs.async_op(function(resume_cb, except_cb) {
      var clear_state, close_cb, err, error_cb, id;

      id = 0;
      clear_state = function() {
        window.clearTimeout(id);
        _this.$ws.on('open', function() {});
        _this.$ws.on('close', function() {});
        return _this.$ws.on('error', function() {});
      };
      error_cb = function(msg) {
        return function(e) {
          clear_state();
          return except_cb(function() {
            return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + e);
          });
        };
      };
      close_cb = function(msg) {
        return function(e) {
          clear_state();
          return except_cb(function() {
            return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + websocket_status_to_message(e.status));
          });
        };
      };
      // Success case
      _this.$ws.on('open', function() {
        debug('Open!');
        clear_state();
        return resume_cb();
      });
      // Error cases
      _this.$ws.on('close', close_cb('Connection failed! (Closed)'));
      // Timeout case. In the case of no timeout, we set a default one of 10s.
      if (timeout === 0) {
        timeout = 10000;
      }
      id = setTimeout(error_cb('Connection timeout!'), timeout);
      debug("Host: " + host);
      // Launch!
      try {
        return _this.$ws.open(host);
      } catch (_error) {
        err = _error;
        return error_cb('Connection failed! (exception)')(err.message);
      }
    });
  }), o('socketBind(Ljava/net/InetAddress;I)V', function(rs, _this, address, port) {
    return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to bind');
  }), o('socketListen(I)V', function(rs, _this, port) {
    return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to listen');
  }), o('socketAccept(Ljava/net/SocketImpl;)V', function(rs, _this, s) {
    return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to accept');
  }), o('socketAvailable()I', function(rs, _this) {
    return rs.async_op(function(resume_cb) {
      return setImmediate(function() {
        return resume_cb(_this.$ws.rQlen());
      });
    });
  }), o('socketClose0(Z)V', function(rs, _this, useDeferredClose) {
    // TODO: Something isn't working here
    return _this.$ws.close();
  }), o('socketShutdown(I)V', function(rs, _this, type) {
    return _this.$is_shutdown = true;
  }), o('initProto()V', function(rs) {}),
  o('socketSetOption(IZLjava/lang/Object;)V', function(rs, _this, cmd, _on, value) {}),
  o('socketGetOption(ILjava/lang/Object;)I', function(rs, _this, opt, iaContainerObj) {}),
  o('socketGetOption1(ILjava/lang/Object;Ljava/io/FileDescriptor;)I', function(rs, _this, opt, iaContainerObj, fd) {}),
  o('socketSendUrgentData(I)V', function(rs, _this, data) {
    // Urgent data is meant to jump ahead of the
    // outbound stream. We keep no notion of this,
    // so queue up the byte like normal
    return _this.$ws.send(data);
  })
];

/**
 * Asynchronously read data from a socket. Note that if this passes 0 to the
 * callback, Java will think it has received an EOF. Thus, we should wait until:
 * - We have at least one byte to return.
 * - The socket is closed.
 */
function socket_read_async(impl, b, offset, len, resume_cb) {
  var available, i, read, trimmed_len, _i;

  available = impl.$ws.rQlen();
  trimmed_len = available < len ? available : len;
  read = impl.$ws.rQshiftBytes(trimmed_len);
  for (i = _i = 0; _i < trimmed_len; i = _i += 1) {
    b.array[offset++] = read[i];
  }
  return resume_cb(trimmed_len);
}

native_methods['java']['net']['SocketInputStream'] = [
  o('init()V', function(rs) {}), o('socketRead0(Ljava/io/FileDescriptor;[BIII)I', function(rs, _this, fd, b, offset, len, timeout) {
    var impl = _this.get_field(rs, 'Ljava/net/SocketInputStream;impl');
    if (impl.$is_shutdown === true) {
      rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.');
    }
    return rs.async_op(function(resume_cb) {
      return setTimeout(function() { socket_read_async(impl, b, offset, len, resume_cb) }, timeout);
    });
  })
];

native_methods['java']['net']['SocketOutputStream'] = [
  o('init()V', function(rs) {}), o('socketWrite0(Ljava/io/FileDescriptor;[BII)V', function(rs, _this, fd, b, offset, len) {
    var impl = _this.get_field(rs, 'Ljava/net/SocketOutputStream;impl');
    if (impl.$is_shutdown === true) {
      rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.');
    }
    if (impl.$ws.get_raw_state() !== WebSocket.OPEN) {
      rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'Connection isn\'t open');
    }
    // TODO: This can be optimized by accessing the 'Q' directly
    impl.$ws.send(b.array.slice(offset, offset + len));
    // Let the browser write it out
    return rs.async_op(function(resume_cb) {
      return setImmediate(function() {
        return resume_cb();
      });
    });
  })
];

native_methods['sun']['net']['spi']['DefaultProxySelector'] = [
  o('init()Z', function(rs) {
    return true;
  }), o('getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;', function(rs) {
    return null;
  })
];

// Used by invoke0 to handle manually setting up the caller's stack frame
function setup_caller_stack(rs, method, obj, params) {
  var i, p, p_type, primitive_value, _i, _len, _ref5;

  if (!method.access_flags["static"]) {
    rs.push(obj);
  }
  // we don't get unboxing for free anymore, so we have to do it ourselves
  i = 0;
  _ref5 = method.param_types;
  for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
    p_type = _ref5[_i];
    p = params.array[i++];
    // cat 2 primitives
    if (p_type === 'J' || p_type === 'D') {
      if ((p != null ? p.ref : void 0) != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push2(primitive_value, null);
      } else {
        rs.push2(p, null);
        i++; // skip past the null spacer
      }
    } else if (util.is_primitive_type(p_type)) { // any other primitive
      if ((p != null ? p.ref : void 0) != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push(primitive_value);
      } else {
        rs.push(p);
      }
    } else {
      rs.push(p);
    }
  }
  return rs.curr_frame();
}

native_methods['sun']['reflect'] = {
  ConstantPool: [
    o('getLongAt0(Ljava/lang/Object;I)J', function(rs, _this, cp, idx) {
      return cp.get(idx).value;
    }), o('getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;', function(rs, _this, cp, idx) {
      return rs.init_string(cp.get(idx).value);
    })
  ],
  NativeMethodAccessorImpl: [
    o('invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', function(rs, m, obj, params) {
      var caller_sf, cleanup_runner, cls, cls_obj, m_sig, method, name, p_desc, p_types, pt, ret_descriptor, ret_type, slot;

      cls = m.get_field(rs, 'Ljava/lang/reflect/Method;clazz');
      // make the cleanup runner, before we branch too much
      ret_type = m.get_field(rs, 'Ljava/lang/reflect/Method;returnType');
      ret_descriptor = ret_type.$cls.get_type();
      if (util.is_primitive_type(ret_descriptor) && ret_descriptor !== 'V') {
        cleanup_runner = function() {
          var rv;

          rv = ret_descriptor === 'J' || ret_descriptor === 'D' ? rs.pop2() : rs.pop();
          rs.meta_stack().pop();
          // wrap up primitives in their Object box
          return rs.push(ret_type.$cls.create_wrapper_object(rs, rv));
        };
      } else {
        cleanup_runner = function() {
          var rv;

          rv = rs.pop();
          rs.meta_stack().pop();
          return rs.push(rv);
        };
      }
      // dispatch this sucka
      if (cls.$cls.access_byte & 0x200) { // cls is an interface, so we need to virtual dispatch
        cls_obj = rs.check_null(obj).cls;
        name = m.get_field(rs, 'Ljava/lang/reflect/Method;name').jvm2js_str(rs);
        p_types = m.get_field(rs, 'Ljava/lang/reflect/Method;parameterTypes');
        p_desc = ((function() {
          var _i, _len, _ref5, _results;

          _ref5 = p_types.array;
          _results = [];
          for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
            pt = _ref5[_i];
            _results.push(pt.$cls.get_type());
          }
          return _results;
        })()).join('');
        m_sig = "" + name + "(" + p_desc + ")" + ret_descriptor;
        method = cls_obj.method_lookup(rs, m_sig);
        caller_sf = setup_caller_stack(rs, method, obj, params);
        method.setup_stack(rs);
        caller_sf.runner = cleanup_runner;
        throw exceptions.ReturnException;
      } else {
        slot = m.get_field(rs, 'Ljava/lang/reflect/Method;slot');
        return rs.async_op(function(resume_cb, except_cb) {
          return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function(cls_obj) {
            var sig;

            method = ((function() {
              var _ref5, _results;

              _ref5 = cls_obj.get_methods();
              _results = [];
              for (sig in _ref5) {
                method = _ref5[sig];
                if (method.idx === slot) {
                  _results.push(method);
                }
              }
              return _results;
            })())[0];
            caller_sf = setup_caller_stack(rs, method, obj, params);
            // Reenter the RuntimeState loop, which should run our new StackFrame.
            // XXX: We use except_cb because it just replaces the runner function of the
            // current frame. We need a better story for calling Java threads through
            // native functions.
            return except_cb(function() {
              method.setup_stack(rs);
              return caller_sf.runner = cleanup_runner;
            });
          }), except_cb);
        });
      }
    })
  ],
  NativeConstructorAccessorImpl: [
    o('newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;', function(rs, m, params) {
      var cls, slot;

      cls = m.get_field(rs, 'Ljava/lang/reflect/Constructor;clazz');
      slot = m.get_field(rs, 'Ljava/lang/reflect/Constructor;slot');
      return rs.async_op(function(resume_cb, except_cb) {
        return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function(cls_obj) {
          var method, my_sf, obj, sig;

          method = ((function() {
            var _ref5, _results;

            _ref5 = cls_obj.get_methods();
            _results = [];
            for (sig in _ref5) {
              method = _ref5[sig];
              if (method.idx === slot) {
                _results.push(method);
              }
            }
            return _results;
          })())[0];
          my_sf = rs.curr_frame();
          obj = new JavaObject(rs, cls_obj);
          rs.push(obj);
          if (params != null) {
            rs.push_array(params.array);
          }
          // Reenter the RuntimeState loop, which should run our new StackFrame.
          // XXX: We use except_cb because it just replaces the runner function of the
          // current frame. We need a better story for calling Java threads through
          // native functions.
          return except_cb(function() {
            // Push the constructor's frame onto the stack.
            method.setup_stack(rs);
            // Overwrite my runner.
            return my_sf.runner = function() {
              rs.meta_stack().pop();
              return rs.push(obj);
            };
          });
        }), except_cb);
      });
    })
  ],
  Reflection: [
    o('getCallerClass0(I)Ljava/lang/Class;', get_caller_class),
    o('getCallerClass(I)Ljava/lang/Class;', get_caller_class),
    o('getCallerClass()Ljava/lang/Class;', function(rs) {
      // 0th item is Reflection class, 1st item is the class that called us,
      // and 2nd item is the caller of our caller, which is correct.
      return get_caller_class(rs, 2);
    }),
    o('getClassAccessFlags(Ljava/lang/Class;)I', function(rs, class_obj) {
      return class_obj.$cls.access_byte;
    })
  ]
};

function flatten_pkg(pkg) {
  var pkg_name_arr, rec_flatten, result;

  result = {};
  pkg_name_arr = [];
  rec_flatten = function (pkg) {
    var flattened_inner, fn, fn_name, full_name, full_pkg_name, inner_pkg, method, pkg_name, _i, _len;
    for (pkg_name in pkg) {
      inner_pkg = pkg[pkg_name];
      pkg_name_arr.push(pkg_name);
      if (inner_pkg instanceof Array) {
        full_pkg_name = pkg_name_arr.join('/');
        for (_i = 0, _len = inner_pkg.length; _i < _len; _i++) {
          method = inner_pkg[_i];
          fn_name = method.fn_name, fn = method.fn;
          // expand out the '!'s in the method names
          fn_name = fn_name.replace(/!|;/g, (function () {
            var depth;

            depth = 0;
            return function (c) {
              if (c === '!') {
                return pkg_name_arr[depth++];
              } else if (c === ';') {
                depth = 0;
                return c;
              } else {
                return c;
              }
            };
          })());
          full_name = "L" + full_pkg_name + ";::" + fn_name;
          result[full_name] = fn;
        }
      } else {
        flattened_inner = rec_flatten(inner_pkg);
      }
      pkg_name_arr.pop(pkg_name);
    }
  };
  rec_flatten(pkg);
  return result;
}

trapped_methods = flatten_pkg(trapped_methods);

native_methods = flatten_pkg(native_methods);
