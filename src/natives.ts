"use strict";
import gLong = module('./gLong');
import util = module('./util');
import runtime = module('./runtime');
import java_object = module('./java_object');
var thread_name = java_object.thread_name, JavaObject = java_object.JavaObject, JavaArray = java_object.JavaArray;
import exceptions = module('./exceptions');
import logging = module('./logging');
var debug = logging.debug, error = logging.error, trace = logging.trace;
import JVM = module('./jvm');

// For types; shouldn't actually be used.
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');

declare var node;
var path = typeof node !== "undefined" ? node.path : require('path');
var fs = typeof node !== "undefined" ? node.fs : require('fs');
import ClassData = module('./ClassData');
var ReferenceClassData = ClassData.ReferenceClassData, PrimitiveClassData = ClassData.PrimitiveClassData, ArrayClassData = ClassData.ArrayClassData;

function get_property(rs: runtime.RuntimeState, jvm_key: java_object.JavaObject, _default: java_object.JavaObject): java_object.JavaObject {
  var jvm, key, val;

  if (_default == null) {
    _default = null;
  }
  key = jvm_key.jvm2js_str();
  jvm = jvm != null ? jvm : require('./jvm');
  val = jvm.system_properties[key];
  if (key === 'java.class.path') {
    return rs.init_string(val.slice(0, val.length - 1).join(':'));
  }
  if (val != null) {
    return rs.init_string(val, true);
  } else {
    return _default;
  }
}

function o(fn_name: string, fn: Function): { fn_name: string; fn: Function} {
  return {
    fn_name: fn_name,
    fn: fn
  };
}

export var trapped_methods = {
  java: {
    lang: {
      ref: {
        Reference: [o('<clinit>()V', function(rs) {})]
      },
      String: [
        o('hashCode()I', function(rs:runtime.RuntimeState, _this: java_object.JavaObject): number {
          var chars, count, hash, i, offset, _i;

          hash = _this.get_field(rs, 'Ljava/lang/String;hash');
          if (hash === 0) {
            offset = _this.get_field(rs, 'Ljava/lang/String;offset');
            chars = _this.get_field(rs, 'Ljava/lang/String;value').array;
            count = _this.get_field(rs, 'Ljava/lang/String;count');
            for (i = _i = 0; _i < count; i = _i += 1) {
              hash = (hash * 31 + chars[offset++]) | 0;
            }
            _this.set_field(rs, 'Ljava/lang/String;hash', hash);
          }
          return hash;
        })
      ],
      System: [
        o('loadLibrary(L!/!/String;)V', function(rs: runtime.RuntimeState, lib_name: java_object.JavaObject): void {
          var lib = lib_name.jvm2js_str();
          if (lib !== 'zip' && lib !== 'net' && lib !== 'nio' && lib !== 'awt' && lib !== 'fontmanager') {
            return rs.java_throw((<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;')), "no " + lib + " in java.library.path");
          }
        }),o('adjustPropertiesForBackwardCompatibility(L!/util/Properties;)V', function(rs) {}), o('getProperty(L!/!/String;)L!/!/String;', get_property), o('getProperty(L!/!/String;L!/!/String;)L!/!/String;', get_property)
      ],
      Terminator: [o('setup()V', function(rs) {})]
    },
    util: {
      concurrent: {
        atomic: {
          AtomicInteger: [
            o('<clinit>()V', function(rs) {}), o('compareAndSet(II)Z', function(rs, _this, expect, update) {
              _this.set_field(rs, 'Ljava/util/concurrent/atomic/AtomicInteger;value', update);
              return true;
            })
          ]
        }
      }
    },
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
          o('run()L!/lang/Object;', function(rs: runtime.RuntimeState): java_object.JavaObject {
            return null;
          })
        ]
      }
    }
  }
};

function doPrivileged(rs: runtime.RuntimeState, action: methods.Method): void {
  var m, my_sf;

  my_sf = rs.curr_frame();
  m = action.cls.method_lookup(rs, 'run()Ljava/lang/Object;');
  if (m != null) {
    if (!m.access_flags["static"]) {
      rs.push(action);
    }
    m.setup_stack(rs);
    my_sf.runner = function () {
      var rv;

      rv = rs.pop();
      rs.meta_stack().pop();
      rs.push(rv);
    };
    throw exceptions.ReturnException;
  } else {
    rs.async_op(function (resume_cb, except_cb) {
      action.cls.resolve_method(rs, 'run()Ljava/lang/Object;', (function () {
        rs.meta_stack().push({});
        resume_cb();
      }), except_cb);
    });
  }
}

function stat_fd(fd) {
  var e;

  try {
    return fs.fstatSync(fd);
  } catch (_error) {
    e = _error;
    return null;
  }
}

function stat_file(fname: string, cb: (stat: any)=>void): void {
  fs.stat(fname, function (err, stat) {
    if (err != null) {
      cb(null);
    } else {
      cb(stat);
    }
  });
}

function arraycopy_no_check(src: java_object.JavaArray, src_pos: number, dest: java_object.JavaArray, dest_pos: number, length: number): void {
  var i, j, _i, _ref5;

  j = dest_pos;
  for (i = _i = src_pos, _ref5 = src_pos + length; _i < _ref5; i = _i += 1) {
    dest.array[j++] = src.array[i];
  }
}

function arraycopy_check(rs: runtime.RuntimeState, src: java_object.JavaArray, src_pos: number, dest: java_object.JavaArray, dest_pos: number, length: number): void {
  var dest_comp_cls, i, j, _i, _ref5;

  j = dest_pos;
  dest_comp_cls = dest.cls.get_component_class();
  for (i = _i = src_pos, _ref5 = src_pos + length; _i < _ref5; i = _i += 1) {
    if (src.array[i] === null || src.array[i].cls.is_castable(dest_comp_cls)) {
      dest.array[j] = src.array[i];
    } else {
      rs.java_throw((<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayStoreException;')), 'Array element in src cannot be cast to dest array type.');
    }
    j++;
  }
}

function unsafe_memcpy(rs: runtime.RuntimeState, src_base: java_object.JavaArray, src_offset_l: gLong, dest_base: java_object.JavaArray, dest_offset_l: gLong, num_bytes_l: gLong): void {
  var dest_addr, i, src_addr, _i, _j, _k, _l, _m, _n;

  var num_bytes = num_bytes_l.toNumber();
  if (src_base != null) {
    var src_offset = src_offset_l.toNumber();
    if (dest_base != null) {
      return arraycopy_no_check(src_base, src_offset, dest_base, dest_offset_l.toNumber(), num_bytes);
    } else {
      dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (i = _i = 0; _i < num_bytes; i = _i += 1) {
          rs.mem_blocks[dest_addr].setInt8(i, src_base.array[src_offset + i]);
        }
      } else {
        for (i = _j = 0; _j < num_bytes; i = _j += 1) {
          rs.mem_blocks[dest_addr + i] = src_base.array[src_offset + i];
        }
      }
    }
  } else {
    src_addr = rs.block_addr(src_offset_l);
    if (dest_base != null) {
      var dest_offset = dest_offset_l.toNumber();
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (i = _k = 0; _k < num_bytes; i = _k += 1) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr].getInt8(i);
        }
      } else {
        for (i = _l = 0; _l < num_bytes; i = _l += 1) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr + i];
        }
      }
    } else {
      dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (i = _m = 0; _m < num_bytes; i = _m += 1) {
          rs.mem_blocks[dest_addr].setInt8(i, rs.mem_blocks[src_addr].getInt8(i));
        }
      } else {
        for (i = _n = 0; _n < num_bytes; i = _n += 1) {
          rs.mem_blocks[dest_addr + i] = rs.mem_blocks[src_addr + i];
        }
      }
    }
  }
}

function unsafe_compare_and_swap(rs: runtime.RuntimeState, _this: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, expected: any, x: any): boolean {
  var actual;

  actual = obj.get_field_from_offset(rs, offset);
  if (actual === expected) {
    obj.set_field_from_offset(rs, offset, x);
    return true;
  } else {
    return false;
  }
}

function native_define_class(rs: runtime.RuntimeState, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, loader: ClassLoader.ClassLoader, resume_cb: (jco: java_object.JavaClassObject) => void, except_cb: (e_fn: ()=>void)=>void): void {
  var b, raw_bytes;

  raw_bytes = (function () {
    var _i, _len, _ref5, _results;

    _ref5 = bytes.array.slice(offset, offset + len);
    _results = [];
    for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
      b = _ref5[_i];
      _results.push((256 + b) % 256);
    }
    return _results;
  })();
  loader.define_class(rs, util.int_classname(name.jvm2js_str()), raw_bytes, (function (cdata) {
    resume_cb(cdata.get_class_object(rs));
  }), except_cb);
}

function write_to_file(rs: runtime.RuntimeState, _this: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number): void {
  var fd, fd_obj;

  fd_obj = _this.get_field(rs, 'Ljava/io/FileOutputStream;fd');
  fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
  if (fd === -1) {
    rs.java_throw((<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;')), "Bad file descriptor");
  }
  if (fd !== 1 && fd !== 2) {
    _this.$pos += fs.writeSync(fd, new Buffer(bytes.array), offset, len, _this.$pos);
    return;
  }
  rs.print(util.chars2js_str(bytes, offset, len));
  if (typeof node !== "undefined" && node !== null) {
    rs.async_op(function (cb) {
      cb();
    });
  }
}

function get_cl_from_jclo(rs: runtime.RuntimeState, jclo: java_object.JavaClassLoaderObject): ClassLoader.ClassLoader {
  if ((jclo != null) && (jclo.$loader != null)) {
    return jclo.$loader;
  } else {
    return rs.get_bs_cl();
  }
}

function create_stack_trace(rs: runtime.RuntimeState, throwable: java_object.JavaObject): java_object.JavaObject[] {
  var cls, cstack, i, ln, row, sf, source_file, stacktrace, table, _i, _len, _ref5, _ref6, _ref7, _ref8;

  stacktrace = [];
  cstack = rs.meta_stack()._cs.slice(1, -1);
  for (_i = 0, _len = cstack.length; _i < _len; _i++) {
    sf = cstack[_i];
    if (!(!(sf["native"] || sf.locals[0] === throwable))) {
      continue;
    }
    cls = sf.method.cls;
    ln = -1;
    if (throwable.cls.get_type() !== 'Ljava/lang/NoClassDefFoundError;') {
      if (sf.method.access_flags["native"]) {
        source_file = 'Native Method';
      } else {
        source_file = ((_ref5 = cls.get_attribute('SourceFile')) != null ? _ref5.filename : void 0) || 'unknown';
        table = (_ref6 = sf.method.code) != null ? _ref6.get_attribute('LineNumberTable') : void 0;
        if (table == null) {
          break;
        }
        _ref7 = table.entries;
        for (i in _ref7) {
          row = _ref7[i];
          if (row.start_pc <= sf.pc) {
            ln = row.line_number;
          }
        }
      }
    } else {
      source_file = 'unknown';
    }
    stacktrace.push(new JavaObject(rs, (<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/StackTraceElement;')), {
      'Ljava/lang/StackTraceElement;declaringClass': rs.init_string(util.ext_classname(cls.get_type())),
      'Ljava/lang/StackTraceElement;methodName': rs.init_string((_ref8 = sf.method.name) != null ? _ref8 : 'unknown'),
      'Ljava/lang/StackTraceElement;fileName': rs.init_string(source_file),
      'Ljava/lang/StackTraceElement;lineNumber': ln
    }));
  }
  return stacktrace.reverse();
}

function verify_array(rs: runtime.RuntimeState, obj: any): java_object.JavaArray {
  if (!(obj instanceof java_object.JavaArray)) {
    var err_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/IllegalArgumentException;');
    this.java_throw(err_cls, 'Object is not an array.');
  }
  return <java_object.JavaArray> obj;
}

export var native_methods = {
  classes: {
    awt: {
      CanvasGraphicsEnvironment: []
    },
    doppio: {
      JavaScript: [
        o('eval(Ljava/lang/String;)Ljava/lang/String;', function (rs: runtime.RuntimeState, to_eval: java_object.JavaObject): java_object.JavaObject {
          var rv = eval(to_eval.jvm2js_str());
          if (rv != null) {
            return rs.init_string("" + rv);
          } else {
            return null;
          }
        })
      ]
    }
  },
  java: {
    lang: {
      ClassLoader: [
        o('findLoadedClass0(L!/!/String;)L!/!/Class;', function (rs: runtime.RuntimeState, _this: java_object.JavaClassLoaderObject, name: java_object.JavaObject): java_object.JavaClassObject {
          var cls, loader, type;

          loader = get_cl_from_jclo(rs, _this);
          type = util.int_classname(name.jvm2js_str());
          cls = loader.get_resolved_class(type, true);
          if (cls != null) {
            return cls.get_class_object(rs);
          } else {
            return null;
          }
        }), o('findBootstrapClass(L!/!/String;)L!/!/Class;', function (rs: runtime.RuntimeState, _this: java_object.JavaClassLoaderObject, name: java_object.JavaObject): void {
          var type = util.int_classname(name.jvm2js_str());
          rs.async_op<java_object.JavaClassObject>(function (resume_cb, except_cb) {
            rs.get_bs_cl().resolve_class(rs, type, (function (cls) {
              resume_cb(cls.get_class_object(rs));
            }), except_cb, true);
          });
        }), o('getCaller(I)L!/!/Class;', function (rs: runtime.RuntimeState, i: number): java_object.JavaClassObject {
          var cls = rs.meta_stack().get_caller(i).method.cls;
          return cls.get_class_object(rs);
        }), o('defineClass1(L!/!/String;[BIIL!/security/ProtectionDomain;L!/!/String;Z)L!/!/Class;', function (rs: runtime.RuntimeState, _this: java_object.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, pd: gLong, source: java_object.JavaObject, unused: java_object.JavaObject): void {
          var loader = get_cl_from_jclo(rs, _this);
          rs.async_op<java_object.JavaClassObject>(function (resume_cb, except_cb) {
            native_define_class(rs, name, bytes, offset, len, loader, resume_cb, except_cb);
          });
        }), o('defineClass1(L!/!/String;[BIIL!/security/ProtectionDomain;L!/!/String;)L!/!/Class;', function (rs: runtime.RuntimeState, _this: java_object.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, pd: gLong, source: java_object.JavaObject): void {
          var loader = get_cl_from_jclo(rs, _this);
          rs.async_op<java_object.JavaClassObject>(function (resume_cb, except_cb) {
            native_define_class(rs, name, bytes, offset, len, loader, resume_cb, except_cb);
          });
        }), o('resolveClass0(L!/!/Class;)V', function (rs: runtime.RuntimeState, _this: java_object.JavaClassLoaderObject, cls: java_object.JavaClassObject): void {
          var loader, type;

          loader = get_cl_from_jclo(rs, _this);
          type = cls.$cls.get_type();
          if (loader.get_resolved_class(type, true) != null) {
            return;
          }
          rs.async_op<void >(function (resume_cb, except_cb) {
            loader.resolve_class(rs, type, (function () {
              resume_cb();
            }), except_cb, true);
          });
        })
      ],
      Compiler: [o('disable()V', function (rs, _this) { }), o('enable()V', function (rs, _this) { })],
      Float: [
        o('floatToRawIntBits(F)I', function (rs: runtime.RuntimeState, f_val: number): number {
          var exp, f_view, i_view, sig, sign;

          if (typeof Float32Array !== "undefined" && Float32Array !== null) {
            f_view = new Float32Array([f_val]);
            i_view = new Int32Array(f_view.buffer);
            return i_view[0];
          }
          if (f_val === 0) {
            return 0;
          }
          if (f_val === Number.POSITIVE_INFINITY) {
            return util.FLOAT_POS_INFINITY_AS_INT;
          }
          if (f_val === Number.NEGATIVE_INFINITY) {
            return util.FLOAT_NEG_INFINITY_AS_INT;
          }
          if (isNaN(f_val)) {
            return util.FLOAT_NaN_AS_INT;
          }
          sign = f_val < 0 ? 1 : 0;
          f_val = Math.abs(f_val);
          if (f_val <= 1.1754942106924411e-38 && f_val >= 1.4012984643248170e-45) {
            exp = 0;
            sig = Math.round((f_val / Math.pow(2, -126)) * Math.pow(2, 23));
            return (sign << 31) | (exp << 23) | sig;
          } else {
            exp = Math.floor(Math.log(f_val) / Math.LN2);
            sig = Math.round((f_val / Math.pow(2, exp) - 1) * Math.pow(2, 23));
            return (sign << 31) | ((exp + 127) << 23) | sig;
          }
        }), o('intBitsToFloat(I)F', function (rs: runtime.RuntimeState, i_val: number): number {
          return util.intbits2float(i_val);
        })
      ],
      Double: [
        o('doubleToRawLongBits(D)J', function (rs: runtime.RuntimeState, d_val: number): gLong {
          var d_view, exp, high_bits, i_view, sig, sign;

          if (typeof Float64Array !== "undefined" && Float64Array !== null) {
            d_view = new Float64Array([d_val]);
            i_view = new Uint32Array(d_view.buffer);
            return gLong.fromBits(i_view[0], i_view[1]);
          }
          if (d_val === 0) {
            return gLong.ZERO;
          }
          if (d_val === Number.POSITIVE_INFINITY) {
            return gLong.fromBits(0, 2146435072);
          } else if (d_val === Number.NEGATIVE_INFINITY) {
            return gLong.fromBits(0, -1048576);
          } else if (isNaN(d_val)) {
            return gLong.fromBits(0, 2146959360);
          }
          sign = d_val < 0 ? 1 << 31 : 0;
          d_val = Math.abs(d_val);
          if (d_val <= 2.2250738585072010e-308 && d_val >= 5.0000000000000000e-324) {
            exp = 0;
            sig = gLong.fromNumber((d_val / Math.pow(2, -1022)) * Math.pow(2, 52));
          } else {
            exp = Math.floor(Math.log(d_val) / Math.LN2);
            if (d_val < Math.pow(2, exp)) {
              exp = exp - 1;
            }
            sig = gLong.fromNumber((d_val / Math.pow(2, exp) - 1) * Math.pow(2, 52));
            exp = (exp + 1023) << 20;
          }
          high_bits = sig.getHighBits() | sign | exp;
          return gLong.fromBits(sig.getLowBits(), high_bits);
        }), o('longBitsToDouble(J)D', function (rs: runtime.RuntimeState, l_val: gLong): number {
          return util.longbits2double(l_val.getHighBits(), l_val.getLowBitsUnsigned());
        })
      ],
      Object: [
        o('getClass()L!/!/Class;', function (rs: runtime.RuntimeState, _this: java_object.JavaObject): java_object.JavaClassObject {
          return _this.cls.get_class_object(rs);
        }), o('hashCode()I', function (rs: runtime.RuntimeState, _this: java_object.JavaObject): number {
          return _this.ref;
        }), o('clone()L!/!/!;', function (rs: runtime.RuntimeState, _this: java_object.JavaObject): java_object.JavaObject {
          return _this.clone(rs);
        }), o('notify()V', function (rs: runtime.RuntimeState, _this: java_object.JavaObject): void {
          var locker, owner;

          debug("TE(notify): on lock *" + _this.ref);
          if ((locker = rs.lock_refs[_this]) != null) {
            if (locker !== rs.curr_thread) {
              owner = thread_name(rs, locker);
              rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
            }
          }
          if (rs.waiting_threads[_this] != null) {
            rs.waiting_threads[_this].shift();
          }
        }), o('notifyAll()V', function (rs: runtime.RuntimeState, _this: java_object.JavaObject): void {
          var locker, owner;

          debug("TE(notifyAll): on lock *" + _this.ref);
          if ((locker = rs.lock_refs[_this]) != null) {
            if (locker !== rs.curr_thread) {
              owner = thread_name(rs, locker);
              rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
            }
          }
          if (rs.waiting_threads[_this] != null) {
            rs.waiting_threads[_this] = [];
          }
        }), o('wait(J)V', function (rs: runtime.RuntimeState, _this: java_object.JavaObject, timeout: gLong): void {
          var locker, owner;

          if (timeout !== gLong.ZERO) {
            error("TODO(Object::wait): respect the timeout param (" + timeout + ")");
          }
          if ((locker = rs.lock_refs[_this]) != null) {
            if (locker !== rs.curr_thread) {
              owner = thread_name(rs, locker);
              rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
            }
          }
          rs.lock_refs[_this] = null;
          rs.wait(_this);
        })
      ],
      Package: [
        o('getSystemPackage0(Ljava/lang/String;)Ljava/lang/String;', function (rs: runtime.RuntimeState, pkg_name_obj: java_object.JavaObject): java_object.JavaObject {
          var pkg_name = pkg_name_obj.jvm2js_str();
          if (rs.get_bs_cl().get_package_names().indexOf(pkg_name) >= 0) {
            return pkg_name_obj;
          } else {
            return null;
          }
        }), o('getSystemPackages0()[Ljava/lang/String;', function (rs: runtime.RuntimeState): java_object.JavaArray {
          var cls_name;

          return new JavaArray(rs, (<ClassData.ArrayClassData>(rs.get_bs_class('[Ljava/lang/String;'))), (function () {
            var _i, _len, _ref5, _results;

            _ref5 = rs.get_bs_cl().get_package_names();
            _results = [];
            for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
              cls_name = _ref5[_i];
              _results.push(rs.init_string(cls_name));
            }
            return _results;
          })());
        })
      ],
      ProcessEnvironment: [
        o('environ()[[B', function (rs: runtime.RuntimeState): java_object.JavaArray {
          var env_arr, k, v, _ref5;

          env_arr = [];
          _ref5 = process.env;
          for (k in _ref5) {
            v = _ref5[k];
            env_arr.push(new JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[B')), util.bytestr_to_array(k)));
            env_arr.push(new JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[B')), util.bytestr_to_array(v)));
          }
          return new JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[[B')), env_arr);
        })
      ],
      reflect: {
        Array: [
          o('newArray(L!/!/Class;I)L!/!/Object;', function (rs: runtime.RuntimeState, _this: java_object.JavaClassObject, len: number): java_object.JavaArray {
            return rs.heap_newarray(_this.$cls.get_type(), len);
          }), o('getLength(Ljava/lang/Object;)I', function (rs: runtime.RuntimeState, obj: any): number {
            var arr = verify_array(rs, obj);
            return rs.check_null(arr).array.length;
          }), o('set(Ljava/lang/Object;ILjava/lang/Object;)V', function (rs: runtime.RuntimeState, obj: any, idx: number, val: java_object.JavaObject): void {
            var array, ccls, ccname, ecls, illegal_exc, m, my_sf;
            var arr = verify_array(rs, obj);

            my_sf = rs.curr_frame();
            array = rs.check_null(arr).array;
            if (!(idx < array.length)) {
              rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;')), 'Tried to write to an illegal index in an array.');
            }
            if ((ccls = arr.cls.get_component_class()) instanceof PrimitiveClassData) {
              if (val.cls.is_subclass(rs.get_bs_class(ccls.box_class_name()))) {
                ccname = ccls.get_type();
                m = val.cls.method_lookup(rs, "" + util.internal2external[ccname] + "Value()" + ccname);
                rs.push(val);
                m.setup_stack(rs);
                my_sf.runner = function() {
                  array[idx] = ccname === 'J' || ccname === 'D' ? rs.pop2() : rs.pop();
                  return rs.meta_stack().pop();
                };
                throw exceptions.ReturnException;
              }
            } else if (val.cls.is_subclass(ccls)) {
              array[idx] = val;
              return;
            }
            illegal_exc = 'Ljava/lang/IllegalArgumentException;';
            if ((ecls = rs.get_bs_class(illegal_exc, true)) != null) {
              return rs.java_throw(ecls, 'argument type mismatch');
            } else {
              return rs.async_op(function(resume_cb, except_cb) {
                return rs.get_cl().initialize_class(rs, illegal_exc, (function(ecls) {
                  return except_cb((function() {
                    return rs.java_throw(ecls, 'argument type mismatch');
                  }));
                }), except_cb);
              });
            }
          })
        ],
        Proxy: [
          o('defineClass0(L!/!/ClassLoader;L!/!/String;[BII)L!/!/Class;', function(rs, cl, name, bytes, offset, len) {
            return rs.async_op(function(success_cb, except_cb) {
              return native_define_class(rs, name, bytes, offset, len, get_cl_from_jclo(rs, cl), success_cb, except_cb);
            });
          })
        ]
      },
      SecurityManager: [
        o('getClassContext()[Ljava/lang/Class;', function(rs, _this) {
          var classes, sf, _i, _ref5;

          classes = [];
          _ref5 = rs.meta_stack()._cs;
          for (_i = _ref5.length - 1; _i >= 0; _i += -1) {
            sf = _ref5[_i];
            if (!sf["native"]) {
              classes.push(sf.method.cls.get_class_object(rs));
            }
          }
          return new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), classes);
        })
      ],
      Shutdown: [
        o('halt0(I)V', function(rs, status) {
          throw new exceptions.HaltException(status);
        })
      ],
      StrictMath: [
        o('acos(D)D', function(rs, d_val) {
          return Math.acos(d_val);
        }), o('asin(D)D', function(rs, d_val) {
          return Math.asin(d_val);
        }), o('atan(D)D', function(rs, d_val) {
          return Math.atan(d_val);
        }), o('atan2(DD)D', function(rs, y, x) {
          return Math.atan2(y, x);
        }), o('cbrt(D)D', function(rs, d_val) {
          var is_neg;

          is_neg = d_val < 0;
          if (is_neg) {
            return -Math.pow(-d_val, 1 / 3);
          } else {
            return Math.pow(d_val, 1 / 3);
          }
        }), o('cos(D)D', function(rs, d_val) {
          return Math.cos(d_val);
        }), o('exp(D)D', function(rs, d_val) {
          return Math.exp(d_val);
        }), o('log(D)D', function(rs, d_val) {
          return Math.log(d_val);
        }), o('log10(D)D', function(rs, d_val) {
          return Math.log(d_val) / Math.LN10;
        }), o('pow(DD)D', function(rs, base, exp) {
          return Math.pow(base, exp);
        }), o('sin(D)D', function(rs, d_val) {
          return Math.sin(d_val);
        }), o('sqrt(D)D', function(rs, d_val) {
          return Math.sqrt(d_val);
        }), o('tan(D)D', function(rs, d_val) {
          return Math.tan(d_val);
        }), o('floor(D)D', function(rs, d_val) {
          return Math.floor(d_val);
        }), o('ceil(D)D', function(rs, d_val) {
          return Math.ceil(d_val);
        })
      ],
      String: [
        o('intern()L!/!/!;', function(rs, _this) {
          var js_str, s;

          js_str = _this.jvm2js_str();
          if ((s = rs.string_pool.get(js_str)) == null) {
            s = rs.string_pool.set(js_str, _this);
          }
          return s;
        })
      ],
      System: [
        o('arraycopy(L!/!/Object;IL!/!/Object;II)V', function(rs, src, src_pos, dest, dest_pos, length) {
          var dest_comp_cls, src_comp_cls;

          if ((src == null) || (dest == null)) {
            rs.java_throw(rs.get_bs_class('Ljava/lang/NullPointerException;'), 'Cannot copy to/from a null array.');
          }
          if (!(src.cls instanceof ArrayClassData) || !(dest.cls instanceof ArrayClassData)) {
            rs.java_throw(rs.get_bs_class('Ljava/lang/ArrayStoreException;'), 'src and dest arguments must be of array type.');
          }
          if (src_pos < 0 || (src_pos + length) > src.array.length || dest_pos < 0 || (dest_pos + length) > dest.array.length || length < 0) {
            rs.java_throw(rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;'), 'Tried to write to an illegal index in an array.');
          }
          if (src === dest) {
            src = {
              cls: src.cls,
              array: src.array.slice(src_pos, src_pos + length)
            };
            src_pos = 0;
          }
          if (src.cls.is_castable(dest.cls)) {
            return arraycopy_no_check(src, src_pos, dest, dest_pos, length);
          } else {
            src_comp_cls = src.cls.get_component_class();
            dest_comp_cls = dest.cls.get_component_class();
            if ((src_comp_cls instanceof PrimitiveClassData) || (dest_comp_cls instanceof PrimitiveClassData)) {
              return rs.java_throw(rs.get_bs_class('Ljava/lang/ArrayStoreException;'), 'If calling arraycopy with a primitive array, both src and dest must be of the same primitive type.');
            } else {
              return arraycopy_check(rs, src, src_pos, dest, dest_pos, length);
            }
          }
        }), o('currentTimeMillis()J', function(rs) {
          return gLong.fromNumber((new Date).getTime());
        }), o('identityHashCode(L!/!/Object;)I', function(rs, x) {
          var _ref5;

          return (_ref5 = x != null ? x.ref : void 0) != null ? _ref5 : 0;
        }), o('initProperties(L!/util/Properties;)L!/util/Properties;', function(rs, props) {
          return rs.push(null);
        }), o('nanoTime()J', function(rs) {
          return gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000));
        }), o('setIn0(L!/io/InputStream;)V', function(rs, stream) {
          var sys;

          sys = rs.get_bs_class('Ljava/lang/System;');
          return sys.static_put(rs, 'in', stream);
        }), o('setOut0(L!/io/PrintStream;)V', function(rs, stream) {
          var sys;

          sys = rs.get_bs_class('Ljava/lang/System;');
          return sys.static_put(rs, 'out', stream);
        }), o('setErr0(L!/io/PrintStream;)V', function(rs, stream) {
          var sys;

          sys = rs.get_bs_class('Ljava/lang/System;');
          return sys.static_put(rs, 'err', stream);
        })
      ],
      Thread: [
        o('currentThread()L!/!/!;', function(rs) {
          return rs.curr_thread;
        }), o('setPriority0(I)V', function(rs) {}), o('holdsLock(L!/!/Object;)Z', function(rs, obj) {
          return rs.curr_thread === rs.lock_refs[obj];
        }), o('isAlive()Z', function(rs, _this) {
          var _ref5;

          return (_ref5 = _this.$isAlive) != null ? _ref5 : false;
        }), o('isInterrupted(Z)Z', function(rs, _this, clear_flag) {
          var tmp, _ref5;

          tmp = (_ref5 = _this.$isInterrupted) != null ? _ref5 : false;
          if (clear_flag) {
            _this.$isInterrupted = false;
          }
          return tmp;
        }), o('interrupt0()V', function(rs, _this) {
          var new_thread_sf;

          _this.$isInterrupted = true;
          if (_this === rs.curr_thread) {
            return;
          }
          if (rs.parked(_this)) {
            rs["yield"](_this);
            return;
          }
          debug("TE(interrupt0): interrupting " + (thread_name(rs, _this)));
          new_thread_sf = util.last(_this.$meta_stack._cs);
          new_thread_sf.runner = function() {
            return rs.java_throw(rs.get_bs_class('Ljava/lang/InterruptedException;'), 'interrupt0 called');
          };
          _this.$meta_stack.push({});
          rs["yield"](_this);
          throw exceptions.ReturnException;
        }), o('start0()V', function(rs, _this) {
          var new_thread_sf, old_thread_sf, run_method, thread_runner_sf;

          _this.$isAlive = true;
          _this.$meta_stack = new runtime.CallStack();
          rs.thread_pool.push(_this);
          old_thread_sf = rs.curr_frame();
          debug("TE(start0): starting " + (thread_name(rs, _this)) + " from " + (thread_name(rs, rs.curr_thread)));
          rs.curr_thread = _this;
          new_thread_sf = rs.curr_frame();
          rs.push(_this);
          run_method = _this.cls.method_lookup(rs, 'run()V');
          thread_runner_sf = run_method.setup_stack(rs);
          new_thread_sf.runner = function() {
            new_thread_sf.runner = null;
            _this.$isAlive = false;
            return debug("TE(start0): thread died: " + (thread_name(rs, _this)));
          };
          old_thread_sf.runner = function() {
            debug("TE(start0): thread resumed: " + (thread_name(rs, rs.curr_thread)));
            return rs.meta_stack().pop();
          };
          throw exceptions.ReturnException;
        }), o('sleep(J)V', function(rs, millis) {
          rs.curr_thread.wakeup_time = (new Date).getTime() + millis.toNumber();
          return rs.async_op(function(resume_cb) {
            return rs.choose_next_thread(null, function(next_thread) {
              rs["yield"](next_thread);
              return resume_cb();
            });
          });
        }), o('yield()V', function(rs, _this) {
          return rs.async_op(function(resume_cb) {
            return rs.choose_next_thread(null, function(next_thread) {
              rs["yield"](next_thread);
              return resume_cb();
            });
          });
        })
      ],
      Throwable: [
        o('fillInStackTrace()L!/!/!;', function(rs, _this) {
          var strace;

          strace = new JavaArray(rs, rs.get_bs_class('[Ljava/lang/StackTraceElement;'), create_stack_trace(rs, _this));
          _this.set_field(rs, 'Ljava/lang/Throwable;stackTrace', strace);
          return _this;
        }), o('getStackTraceDepth()I', function(rs, _this) {
          return create_stack_trace(rs, _this).length;
        }), o('getStackTraceElement(I)L!/!/StackTraceElement;', function(rs, _this, depth) {
          return create_stack_trace(rs, _this)[depth];
        })
      ],
      UNIXProcess: [
        o('forkAndExec([B[BI[BI[BZLjava/io/FileDescriptor;Ljava/io/FileDescriptor;Ljava/io/FileDescriptor;)I', function(rs, _this, prog, argBlock) {
          var args, progname;

          progname = util.chars2js_str(prog, 0, prog.array.length);
          args = util.chars2js_str(argBlock, 0, argBlock.array.length);
          return rs.java_throw(rs.get_bs_class('Ljava/lang/Error;'), "Doppio doesn't support forking processes. Command was: `" + progname + " " + args + "`");
        })
      ]
    },
    security: {
      AccessController: [
        o('doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('getStackAccessControlContext()Ljava/security/AccessControlContext;', function(rs) {
          return null;
        })
      ]
    },
    sql: {
      DriverManager: [
        o('getCallerClassLoader()Ljava/lang/ClassLoader;', function(rs) {
          var rv;

          rv = rs.meta_stack().get_caller(1).method.cls.loader.loader_obj;
          if (rv !== void 0) {
            return rv;
          } else {
            return null;
          }
        })
      ]
    },
    io: {
      Console: [
        o('encoding()L!/lang/String;', function() {
          return null;
        }), o('istty()Z', function() {
          return true;
        })
      ],
      FileSystem: [
        o('getFileSystem()L!/!/!;', function(rs) {
          var cache1, cache2, cache_init, cdata, my_sf;

          my_sf = rs.curr_frame();
          cdata = rs.get_bs_class('Ljava/io/ExpiringCache;');
          cache1 = new JavaObject(rs, cdata);
          cache2 = new JavaObject(rs, cdata);
          cache_init = cdata.method_lookup(rs, '<init>()V');
          rs.push2(cache1, cache2);
          cache_init.setup_stack(rs);
          my_sf.runner = function() {
            cache_init.setup_stack(rs);
            return my_sf.runner = function() {
              var rv, system_properties;

              system_properties = JVM.system_properties;
              rv = new JavaObject(rs, rs.get_bs_class('Ljava/io/UnixFileSystem;'), {
                'Ljava/io/UnixFileSystem;cache': cache1,
                'Ljava/io/UnixFileSystem;javaHomePrefixCache': cache2,
                'Ljava/io/UnixFileSystem;slash': system_properties['file.separator'].charCodeAt(0),
                'Ljava/io/UnixFileSystem;colon': system_properties['path.separator'].charCodeAt(0),
                'Ljava/io/UnixFileSystem;javaHome': rs.init_string(system_properties['java.home'], true)
              });
              rs.meta_stack().pop();
              return rs.push(rv);
            };
          };
          throw exceptions.ReturnException;
        })
      ],
      FileOutputStream: [
        o('open(L!/lang/String;)V', function(rs, _this, fname) {
          return rs.async_op(function(resume_cb) {
            return fs.open(fname.jvm2js_str(), 'w', function(err, fd) {
              var fd_obj;

              fd_obj = _this.get_field(rs, 'Ljava/io/FileOutputStream;fd');
              fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
              _this.$pos = 0;
              return resume_cb();
            });
          });
        }), o('openAppend(Ljava/lang/String;)V', function(rs, _this, fname) {
          return rs.async_op(function(resume_cb) {
            return fs.open(fname.jvm2js_str(), 'a', function(err, fd) {
              var fd_obj;

              fd_obj = _this.get_field(rs, 'Ljava/io/FileOutputStream;fd');
              fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
              _this.$pos = (stat_fd(fd)).size;
              return resume_cb();
            });
          });
        }), o('writeBytes([BIIZ)V', write_to_file), o('writeBytes([BII)V', write_to_file), o('close0()V', function(rs, _this) {
          var fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileOutputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          return rs.async_op(function(resume_cb, except_cb) {
            return fs.close(fd, function(err) {
              if (err) {
                return except_cb(function() {
                  return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                });
              } else {
                fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
                return resume_cb();
              }
            });
          });
        })
      ],
      FileInputStream: [
        o('available()I', function(rs, _this) {
          var fd, fd_obj, stats;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          if (fd === -1) {
            rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), "Bad file descriptor");
          }
          if (fd === 0) {
            return 0;
          }
          stats = fs.fstatSync(fd);
          return stats.size - _this.$pos;
        }), o('read()I', function(rs, _this) {
          var buf, bytes_read, fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          if (fd === -1) {
            rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), "Bad file descriptor");
          }
          if (fd !== 0) {
            buf = new Buffer((fs.fstatSync(fd)).size);
            bytes_read = fs.readSync(fd, buf, 0, 1, _this.$pos);
            _this.$pos++;
            if (bytes_read === 0) {
              return -1;
            } else {
              return buf.readUInt8(0);
            }
          }
          return rs.async_op(function(cb) {
            return rs.async_input(1, function(byte) {
              return cb(byte.length === 0 ? -1 : byte[0]);
            });
          });
        }), o('readBytes([BII)I', function(rs, _this, byte_arr, offset, n_bytes) {
          var buf, bytes_read, fd, fd_obj, filesize, i, pos, _i;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          if (fd === -1) {
            rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), "Bad file descriptor");
          }
          if (fd !== 0) {
            pos = _this.$pos;
            buf = new Buffer(n_bytes);
            filesize = fs.fstatSync(fd).size;
            if (filesize > 0 && pos >= filesize - 1) {
              return -1;
            }
            bytes_read = fs.readSync(fd, buf, 0, n_bytes, pos);
            _this.$pos += bytes_read;
            for (i = _i = 0; _i < bytes_read; i = _i += 1) {
              byte_arr.array[offset + i] = buf.readUInt8(i);
            }
            if (bytes_read === 0 && n_bytes !== 0) {
              return -1;
            } else {
              return bytes_read;
            }
          }
          return rs.async_op(function(cb) {
            return rs.async_input(n_bytes, function(bytes) {
              var b, idx, _j, _len;

              for (idx = _j = 0, _len = bytes.length; _j < _len; idx = ++_j) {
                b = bytes[idx];
                byte_arr.array[offset + idx] = b;
              }
              return cb(bytes.length);
            });
          });
        }), o('open(Ljava/lang/String;)V', function(rs, _this, filename) {
          var filepath;

          filepath = filename.jvm2js_str();
          return rs.async_op(function(resume_cb, except_cb) {
            return fs.open(filepath, 'r', function(e, fd) {
              var fd_obj;

              if (e != null) {
                if (e.code === 'ENOENT') {
                  return except_cb(function() {
                    return rs.java_throw(rs.get_bs_class('Ljava/io/FileNotFoundException;'), "" + filepath + " (No such file or directory)");
                  });
                } else {
                  return except_cb(function() {
                    throw e;
                  });
                }
              } else {
                fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
                fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
                _this.$pos = 0;
                return resume_cb();
              }
            });
          });
        }), o('close0()V', function(rs, _this) {
          var fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          return rs.async_op(function(resume_cb, except_cb) {
            return fs.close(fd, function(err) {
              if (err) {
                return except_cb(function() {
                  return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                });
              } else {
                fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
                return resume_cb();
              }
            });
          });
        }), o('skip(J)J', function(rs, _this, n_bytes) {
          var bytes_left, fd, fd_obj, to_skip;

          fd_obj = _this.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          if (fd === -1) {
            rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), "Bad file descriptor");
          }
          if (fd !== 0) {
            bytes_left = fs.fstatSync(fd).size - _this.$pos;
            to_skip = Math.min(n_bytes.toNumber(), bytes_left);
            _this.$pos += to_skip;
            return gLong.fromNumber(to_skip);
          }
          return rs.async_op(function(cb) {
            return rs.async_input(n_bytes.toNumber(), function(bytes) {
              return cb(gLong.fromNumber(bytes.length), null);
            });
          });
        })
      ],
      ObjectInputStream: [
        o('latestUserDefinedLoader()Ljava/lang/ClassLoader;', function(rs) {
          return null;
        })
      ],
      ObjectStreamClass: [
        o('initNative()V', function(rs) {}), o('hasStaticInitializer(Ljava/lang/Class;)Z', function(rs, cls) {
          return cls.$cls.get_method('<clinit>()V') != null;
        })
      ],
      RandomAccessFile: [
        o('open(Ljava/lang/String;I)V', function(rs, _this, filename, mode) {
          var filepath, mode_str;

          filepath = filename.jvm2js_str();
          mode_str = (function() {
            switch (mode) {
              case 1:
                return 'r';
              case 2:
                return 'r+';
              case 4:
              case 8:
                return 'rs+';
            }
          })();
          return rs.async_op(function(resume_cb, except_cb) {
            return fs.open(filepath, mode_str, function(e, fd) {
              var fd_obj;

              if (e != null) {
                if (e.code === 'ENOENT') {
                  return except_cb(function() {
                    return rs.java_throw(rs.get_bs_class('Ljava/io/FileNotFoundException;'), "Could not open file " + filepath);
                  });
                } else {
                  return except_cb(function() {
                    throw e;
                  });
                }
              } else {
                fd_obj = _this.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
                fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
                _this.$pos = 0;
                return resume_cb();
              }
            });
          });
        }), o('getFilePointer()J', function(rs, _this) {
          return gLong.fromNumber(_this.$pos);
        }), o('length()J', function(rs, _this) {
          var fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          return gLong.fromNumber((stat_fd(fd)).size);
        }), o('seek(J)V', function(rs, _this, pos) {
          return _this.$pos = pos.toNumber();
        }), o('readBytes([BII)I', function(rs, _this, byte_arr, offset, len) {
          var buf, bytes_read, fd, fd_obj, i, _i;

          fd_obj = _this.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          if (_this.$pos >= fs.fstatSync(fd).size - 1) {
            return -1;
          }
          buf = new Buffer(len);
          bytes_read = fs.readSync(fd, buf, 0, len, _this.$pos);
          for (i = _i = 0; _i < bytes_read; i = _i += 1) {
            byte_arr.array[offset + i] = buf.readUInt8(i);
          }
          _this.$pos += bytes_read;
          if (bytes_read === 0 && len !== 0) {
            return -1;
          } else {
            return bytes_read;
          }
        }), o('writeBytes([BII)V', function(rs, _this, byte_arr, offset, len) {
          var fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          return _this.$pos += fs.writeSync(fd, new Buffer(byte_arr.array), offset, len, _this.$pos);
        }), o('close0()V', function(rs, _this) {
          var fd, fd_obj;

          fd_obj = _this.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
          fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
          return rs.async_op(function(resume_cb, except_cb) {
            return fs.close(fd, function(err) {
              if (err) {
                return except_cb(function() {
                  return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                });
              } else {
                fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
                return resume_cb();
              }
            });
          });
        })
      ],
      UnixFileSystem: [
        o('canonicalize0(L!/lang/String;)L!/lang/String;', function(rs, _this, jvm_path_str) {
          var js_str;

          js_str = jvm_path_str.jvm2js_str();
          return rs.init_string(path.resolve(path.normalize(js_str)));
        }), o('checkAccess(Ljava/io/File;I)Z', function(rs, _this, file, access) {
          var filepath;

          filepath = file.get_field(rs, 'Ljava/io/File;path');
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath.jvm2js_str(), function(stats) {
              var mask;

              if (stats == null) {
                return resume_cb(false);
              } else {
                mask = access | (access << 3) | (access << 6);
                return resume_cb((stats.mode & mask) > 0);
              }
            });
          });
        }), o('createDirectory(Ljava/io/File;)Z', function(rs, _this, file) {
          var filepath;

          filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath, function(stat) {
              if (stat != null) {
                return resume_cb(false);
              } else {
                return fs.mkdir(filepath, function(err) {
                  return resume_cb(err != null ? false : true);
                });
              }
            });
          });
        }), o('createFileExclusively(Ljava/lang/String;)Z', function(rs, _this, path) {
          var filepath;

          filepath = path.jvm2js_str();
          return rs.async_op(function(resume_cb, except_cb) {
            return stat_file(filepath, function(stat) {
              if (stat != null) {
                return resume_cb(false);
              } else {
                return fs.open(filepath, 'w', function(err, fd) {
                  if (err != null) {
                    return except_cb(function() {
                      return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                    });
                  } else {
                    return fs.close(fd, function(err) {
                      if (err != null) {
                        return except_cb(function() {
                          return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                        });
                      } else {
                        return resume_cb(true);
                      }
                    });
                  }
                });
              }
            });
          });
        }), o('createFileExclusively(Ljava/lang/String;Z)Z', function(rs, _this, path) {
          var filepath;

          filepath = path.jvm2js_str();
          return rs.async_op(function(resume_cb, except_cb) {
            return stat_file(filepath, function(stat) {
              if (stat != null) {
                return resume_cb(false);
              } else {
                return fs.open(filepath, 'w', function(err, fd) {
                  if (err != null) {
                    return except_cb(function() {
                      return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                    });
                  } else {
                    return fs.close(fd, function(err) {
                      if (err != null) {
                        return except_cb(function() {
                          return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), err.message);
                        });
                      } else {
                        return resume_cb(true);
                      }
                    });
                  }
                });
              }
            });
          });
        }), o('delete0(Ljava/io/File;)Z', function(rs, _this, file) {
          var filepath;

          filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          return rs.async_op(function(resume_cb, except_cb) {
            return stat_file(filepath, function(stats) {
              if (stats == null) {
                return resume_cb(false);
              } else if (stats.isDirectory()) {
                return fs.readdir(filepath, function(err, files) {
                  if (files.length > 0) {
                    return resume_cb(false);
                  } else {
                    return fs.rmdir(filepath, function(err) {
                      return resume_cb(true);
                    });
                  }
                });
              } else {
                return fs.unlink(filepath, function(err) {
                  return resume_cb(true);
                });
              }
            });
          });
        }), o('getBooleanAttributes0(Ljava/io/File;)I', function(rs, _this, file) {
          var filepath;

          filepath = file.get_field(rs, 'Ljava/io/File;path');
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath.jvm2js_str(), function(stats) {
              if (stats == null) {
                return resume_cb(0);
              } else if (stats.isFile()) {
                return resume_cb(3);
              } else if (stats.isDirectory()) {
                return resume_cb(5);
              } else {
                return resume_cb(1);
              }
            });
          });
        }), o('getLastModifiedTime(Ljava/io/File;)J', function(rs, _this, file) {
          var filepath;

          filepath = file.get_field(rs, 'Ljava/io/File;path').jvm2js_str();
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath, function(stats) {
              if (stats == null) {
                return resume_cb(gLong.ZERO, null);
              } else {
                return resume_cb(gLong.fromNumber((new Date(stats.mtime)).getTime()), null);
              }
            });
          });
        }), o('setLastModifiedTime(Ljava/io/File;J)Z', function(rs, _this, file, time) {
          var atime, filepath, mtime;

          mtime = time.toNumber();
          atime = (new Date).getTime();
          filepath = file.get_field(rs, 'Ljava/io/File;path').jvm2js_str();
          return rs.async_op(function(resume_cb) {
            return fs.utimes(filepath, atime, mtime, function(err) {
              return resume_cb(true);
            });
          });
        }), o('getLength(Ljava/io/File;)J', function(rs, _this, file) {
          var filepath;

          filepath = file.get_field(rs, 'Ljava/io/File;path');
          return rs.async_op(function(resume_cb) {
            return fs.stat(filepath.jvm2js_str(), function(err, stat) {
              return resume_cb(gLong.fromNumber(err != null ? 0 : stat.size), null);
            });
          });
        }), o('list(Ljava/io/File;)[Ljava/lang/String;', function(rs, _this, file) {
          var filepath;

          filepath = file.get_field(rs, 'Ljava/io/File;path');
          return rs.async_op(function(resume_cb) {
            return fs.readdir(filepath.jvm2js_str(), function(err, files) {
              var f;

              if (err != null) {
                return resume_cb(null);
              } else {
                return resume_cb(new JavaArray(rs, rs.get_bs_class('[Ljava/lang/String;'), (function() {
                  var _i, _len, _results;

                  _results = [];
                  for (_i = 0, _len = files.length; _i < _len; _i++) {
                    f = files[_i];
                    _results.push(rs.init_string(f));
                  }
                  return _results;
                })()));
              }
            });
          });
        }), o('rename0(Ljava/io/File;Ljava/io/File;)Z', function(rs, _this, file1, file2) {
          var file1path, file2path;

          file1path = (file1.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          file2path = (file2.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          return rs.async_op(function(resume_cb) {
            return fs.rename(file1path, file2path, function(err) {
              return resume_cb(err != null ? false : true);
            });
          });
        }), o('setPermission(Ljava/io/File;IZZ)Z', function(rs, _this, file, access, enable, owneronly) {
          var filepath;

          filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          if (owneronly) {
            access <<= 6;
          } else {
            access |= (access << 6) | (access << 3);
          }
          if (!enable) {
            access = ~access;
          }
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath, function(stats) {
              var existing_access;

              if (stats == null) {
                return resume_cb(false);
              } else {
                existing_access = stats.mode;
                access = enable ? existing_access | access : existing_access & access;
                return fs.chmod(filepath, access, function(err) {
                  return resume_cb(err != null ? false : true);
                });
              }
            });
          });
        }), o('setReadOnly(Ljava/io/File;)Z', function(rs, _this, file) {
          var filepath, mask;

          filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
          mask = ~0x92;
          return rs.async_op(function(resume_cb) {
            return stat_file(filepath, function(stats) {
              if (stats == null) {
                return resume_cb(false);
              } else {
                return fs.chmod(filepath, stats.mode & mask, function(err) {
                  return resume_cb(err != null ? false : true);
                });
              }
            });
          });
        })
      ]
    },
    util: {
      concurrent: {
        atomic: {
          AtomicLong: [
            o('VMSupportsCS8()Z', function() {
              return true;
            })
          ]
        }
      },
      jar: {
        JarFile: [
          o('getMetaInfEntryNames()[L!/lang/String;', function(rs) {
            return null;
          })
        ]
      },
      ResourceBundle: [
        o('getClassContext()[L!/lang/Class;', function(rs) {
          return new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), [null, null, null]);
        })
      ],
      TimeZone: [
        o('getSystemTimeZoneID(L!/lang/String;L!/lang/String;)L!/lang/String;', function(rs, java_home, country) {
          return rs.init_string('GMT');
        }), o('getSystemGMTOffsetID()L!/lang/String;', function(rs) {
          return null;
        })
      ]
    }
  },
  sun: {
    font: {
      FontManager: [],
      FreetypeFontScaler: [o('initIDs(Ljava/lang/Class;)V', function() {})],
      StrikeCache: [
        o('getGlyphCacheDescription([J)V', function(rs, infoArray) {
          infoArray.array[0] = gLong.fromInt(8);
          return infoArray.array[1] = gLong.fromInt(8);
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

          field_names = ['compTimeMonitoringSupport', 'threadContentionMonitoringSupport', 'currentThreadCpuTimeSupport', 'otherThreadCpuTimeSupport', 'bootClassPathSupport', 'objectMonitorUsageSupport', 'synchronizerUsageSupport'];
          vm_management_impl = rs.get_bs_class('Lsun/management/VMManagementImpl;');
          _results = [];
          for (_i = 0, _len = field_names.length; _i < _len; _i++) {
            name = field_names[_i];
            _results.push(vm_management_impl.static_put(rs, name, 0));
          }
          return _results;
        }), o('isThreadAllocatedMemoryEnabled()Z', function() {
          return false;
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
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryManagerImpl;'), []);
        }), o('getMemoryPools0()[Ljava/lang/management/MemoryPoolMXBean;', function(rs) {
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryPoolImpl;'), []);
        })
      ]
    },
    misc: {
      VM: [
        o('initialize()V', function(rs) {
          var props, sys_cls, vm_cls;

          vm_cls = rs.get_bs_class('Lsun/misc/VM;');
          if (!(vm_cls.major_version >= 51)) {
            return;
          }
          sys_cls = rs.get_bs_class('Ljava/lang/System;');
          props = sys_cls.static_get(rs, 'props');
          vm_cls = rs.get_bs_class('Lsun/misc/VM;');
          return vm_cls.static_put('savedProps', props);
        })
      ],
      Unsafe: [
        o('addressSize()I', function(rs, _this) {
          return 4;
        }), o('allocateInstance(Ljava/lang/Class;)Ljava/lang/Object;', function(rs, _this, cls) {
          cls = cls.$cls;
          if (cls.is_initialized(rs)) {
            return new JavaObject(rs, cls);
          } else {
            return rs.async_op(function(resume_cb, except_cb) {
              return cls.loader.initialize_class(rs, cls.get_type(), (function() {
                return resume_cb(new JavaObject(rs, cls));
              }), except_cb);
            });
          }
        }), o('allocateMemory(J)J', function(rs, _this, size) {
          var i, next_addr, _i;

          next_addr = util.last(rs.mem_start_addrs);
          if (typeof DataView !== "undefined" && DataView !== null) {
            rs.mem_blocks[next_addr] = new DataView(new ArrayBuffer(size));
          } else {
            rs.mem_blocks[next_addr] = size;
            next_addr += 1;
            for (i = _i = 0; _i < size; i = _i += 1) {
              rs.mem_blocks[next_addr + i] = 0;
            }
          }
          rs.mem_start_addrs.push(next_addr + size);
          return gLong.fromNumber(next_addr);
        }), o('copyMemory(Ljava/lang/Object;JLjava/lang/Object;JJ)V', function(rs, _this, src_base, src_offset, dest_base, dest_offset, num_bytes) {
          return unsafe_memcpy(rs, src_base, src_offset, dest_base, dest_offset, num_bytes);
        }), o('setMemory(JJB)V', function(rs, _this, address, bytes, value) {
          var block_addr, i, _i;

          block_addr = rs.block_addr(address);
          for (i = _i = 0; _i < bytes; i = _i += 1) {
            if (typeof DataView !== "undefined" && DataView !== null) {
              rs.mem_blocks[block_addr].setInt8(i, value);
            } else {
              rs.mem_blocks[block_addr + i] = value;
            }
          }
        }), o('freeMemory(J)V', function(rs, _this, address) {
          var i, num_blocks, _i;

          if (typeof DataView !== "undefined" && DataView !== null) {
            delete rs.mem_blocks[address.toNumber()];
          } else {
            address = address.toNumber();
            num_blocks = rs.mem_blocks[address - 1];
            for (i = _i = 0; _i < num_blocks; i = _i += 1) {
              delete rs.mem_blocks[address + i];
            }
            delete rs.mem_blocks[address - 1];
            address = address - 1;
          }
          return rs.mem_start_addrs.splice(rs.mem_start_addrs.indexOf(address), 1);
        }), o('putLong(JJ)V', function(rs, _this, address, value) {
          var block_addr, offset, store_word;

          block_addr = rs.block_addr(address);
          offset = address - block_addr;
          if (typeof DataView !== "undefined" && DataView !== null) {
            rs.mem_blocks[block_addr].setInt32(offset, value.getLowBits(), true);
            rs.mem_blocks[block_addr].setInt32(offset + 4, value.getHighBits, true);
          } else {
            store_word = function(rs_, address, word) {
              rs_.mem_blocks[address] = word & 0xFF;
              rs_.mem_blocks[address + 1] = (word >>> 8) & 0xFF;
              rs_.mem_blocks[address + 2] = (word >>> 16) & 0xFF;
              return rs_.mem_blocks[address + 3] = (word >>> 24) & 0xFF;
            };
            store_word(rs, address, value.getLowBits());
            store_word(rs, address + 4, value.getHighBits());
          }
        }), o('getByte(J)B', function(rs, _this, address) {
          var block_addr;

          block_addr = rs.block_addr(address);
          if (typeof DataView !== "undefined" && DataView !== null) {
            return rs.mem_blocks[block_addr].getInt8(address - block_addr);
          } else {
            return rs.mem_blocks[block_addr];
          }
        }), o('arrayBaseOffset(Ljava/lang/Class;)I', function(rs, _this, cls) {
          return 0;
        }), o('arrayIndexScale(Ljava/lang/Class;)I', function(rs, _this, cls) {
          return 1;
        }), o('compareAndSwapObject(Ljava/lang/Object;JLjava/lang/Object;Ljava/lang/Object;)Z', unsafe_compare_and_swap), o('compareAndSwapInt(Ljava/lang/Object;JII)Z', unsafe_compare_and_swap), o('compareAndSwapLong(Ljava/lang/Object;JJJ)Z', unsafe_compare_and_swap), o('ensureClassInitialized(Ljava/lang/Class;)V', function(rs, _this, cls) {
          return rs.async_op(function(resume_cb, except_cb) {
            return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function() {
              return resume_cb();
            }), except_cb);
          });
        }), o('staticFieldOffset(Ljava/lang/reflect/Field;)J', function(rs, _this, field) {
          var jco, slot;

          jco = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz');
          slot = field.get_field(rs, 'Ljava/lang/reflect/Field;slot');
          return gLong.fromNumber(slot + jco.ref);
        }), o('objectFieldOffset(Ljava/lang/reflect/Field;)J', function(rs, _this, field) {
          var jco, slot;

          jco = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz');
          slot = field.get_field(rs, 'Ljava/lang/reflect/Field;slot');
          return gLong.fromNumber(slot + jco.ref);
        }), o('staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;', function(rs, _this, field) {
          var cls;

          cls = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz');
          return new JavaObject(rs, cls.$cls);
        }), o('getBoolean(Ljava/lang/Object;J)Z', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getBooleanVolatile(Ljava/lang/Object;J)Z', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getDouble(Ljava/lang/Object;J)D', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getDoubleVolatile(Ljava/lang/Object;J)D', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getFloat(Ljava/lang/Object;J)F', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getFloatVolatile(Ljava/lang/Object;J)F', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getInt(Ljava/lang/Object;J)I', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getIntVolatile(Ljava/lang/Object;J)I', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getLong(Ljava/lang/Object;J)J', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getLongVolatile(Ljava/lang/Object;J)J', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getShort(Ljava/lang/Object;J)S', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getShortVolatile(Ljava/lang/Object;J)S', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getObject(Ljava/lang/Object;J)Ljava/lang/Object;', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;', function(rs, _this, obj, offset) {
          return obj.get_field_from_offset(rs, offset);
        }), o('putDouble(Ljava/lang/Object;JD)V', function(rs, _this, obj, offset, new_value) {
          return obj.set_field_from_offset(rs, offset, new_value);
        }), o('putInt(Ljava/lang/Object;JI)V', function(rs, _this, obj, offset, new_value) {
          return obj.set_field_from_offset(rs, offset, new_value);
        }), o('putObject(Ljava/lang/Object;JLjava/lang/Object;)V', function(rs, _this, obj, offset, new_obj) {
          return obj.set_field_from_offset(rs, offset, new_obj);
        }), o('putObjectVolatile(Ljava/lang/Object;JLjava/lang/Object;)V', function(rs, _this, obj, offset, new_obj) {
          return obj.set_field_from_offset(rs, offset, new_obj);
        }), o('putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V', function(rs, _this, obj, offset, new_obj) {
          return obj.set_field_from_offset(rs, offset, new_obj);
        }), o('defineClass(Ljava/lang/String;[BIILjava/lang/ClassLoader;Ljava/security/ProtectionDomain;)Ljava/lang/Class;', function(rs, _this, name, bytes, offset, len, loader, pd) {
          return rs.async_op(function(success_cb, except_cb) {
            return native_define_class(rs, name, bytes, offset, len, get_cl_from_jclo(rs, loader), success_cb, except_cb);
          });
        }), o('pageSize()I', function(rs) {
          return 1024;
        }), o('throwException(Ljava/lang/Throwable;)V', function(rs, _this, exception) {
          var my_sf;

          my_sf = rs.curr_frame();
          my_sf.runner = function() {
            my_sf.runner = null;
            throw new exceptions.JavaException(exception);
          };
          throw exceptions.ReturnException;
        }), o('park(ZJ)V', function(rs, _this, absolute, time) {
          var timeout;

          timeout = Infinity;
          if (absolute) {
            timeout = time;
          } else {
            if (time > 0) {
              timeout = (new Date).getTime() + time / 1000000;
            }
          }
          return rs.park(rs.curr_thread, timeout);
        }), o('unpark(Ljava/lang/Object;)V', function(rs, _this, thread) {
          return rs.unpark(thread);
        })
      ]
    },
    nio: {
      ch: {
        FileChannelImpl: [
          o('initIDs()J', function(rs) {
            return gLong.fromNumber(1024);
          }), o('size0(Ljava/io/FileDescriptor;)J', function(rs, _this, fd_obj) {
            var e, fd;

            fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
            try {
              return gLong.fromNumber(fs.fstatSync(fd).size);
            } catch (_error) {
              e = _error;
              return rs.java_throw(rs.get_bs_class('Ljava/io/IOException;'), 'Bad file descriptor.');
            }
          }), o('position0(Ljava/io/FileDescriptor;J)J', function(rs, _this, fd, offset) {
            var parent;

            parent = _this.get_field(rs, 'Lsun/nio/ch/FileChannelImpl;parent');
            return gLong.fromNumber(offset.equals(gLong.NEG_ONE) ? parent.$pos : parent.$pos = offset.toNumber());
          })
        ],
        FileDispatcher: [
          o('init()V', function(rs) {}), o('read0(Ljava/io/FileDescriptor;JI)I', function(rs, fd_obj, address, len) {
            var block_addr, buf, bytes_read, fd, i, _i, _j;

            fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
            block_addr = rs.block_addr(address);
            buf = new Buffer(len);
            bytes_read = fs.readSync(fd, buf, 0, len);
            if (typeof DataView !== "undefined" && DataView !== null) {
              for (i = _i = 0; _i < bytes_read; i = _i += 1) {
                rs.mem_blocks[block_addr].setInt8(i, buf.readInt8(i));
              }
            } else {
              for (i = _j = 0; _j < bytes_read; i = _j += 1) {
                rs.mem_blocks[block_addr + i] = buf.readInt8(i);
              }
            }
            return bytes_read;
          }), o('preClose0(Ljava/io/FileDescriptor;)V', function(rs, fd_obj) {})
        ],
        NativeThread: [
          o("init()V", function(rs) {}), o("current()J", function(rs) {
            return gLong.fromNumber(-1);
          })
        ]
      }
    }
  }
};

native_methods['java']['lang']['Class'] = [
  o('getPrimitiveClass(L!/!/String;)L!/!/!;', function(rs, jvm_str) {
    var prim_cls, type_desc;

    type_desc = util.typestr2descriptor(jvm_str.jvm2js_str());
    prim_cls = rs.get_bs_class(type_desc);
    return prim_cls.get_class_object(rs);
  }), o('getClassLoader0()L!/!/ClassLoader;', function(rs, _this) {
    var loader;

    loader = _this.$cls.loader;
    if (loader.loader_obj != null) {
      return loader.loader_obj;
    }
    return null;
  }), o('desiredAssertionStatus0(L!/!/!;)Z', function(rs) {
    return false;
  }), o('getName0()L!/!/String;', function(rs, _this) {
    return rs.init_string(_this.$cls.toExternalString());
  }), o('forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', function(rs, jvm_str, initialize, loader) {
    var classname = util.int_classname(jvm_str.jvm2js_str());
    if (!util.verify_int_classname(classname)) {
      rs.java_throw(rs.get_bs_class('Ljava/lang/ClassNotFoundException;'), classname);
    }
    loader = get_cl_from_jclo(rs, loader);
    rs.async_op(function(resume_cb, except_cb) {
      if (initialize) {
        return loader.initialize_class(rs, classname, (function(cls) {
          return resume_cb(cls.get_class_object(rs));
        }), except_cb, true);
      } else {
        return loader.resolve_class(rs, classname, (function(cls) {
          return resume_cb(cls.get_class_object(rs));
        }), except_cb, true);
      }
    });
  }), o('getComponentType()L!/!/!;', function(rs, _this) {
    if (!(_this.$cls instanceof ArrayClassData)) {
      return null;
    }
    return _this.$cls.get_component_class().get_class_object(rs);
  }), o('getGenericSignature()Ljava/lang/String;', function(rs, _this) {
    var sig, _ref5;

    sig = (_ref5 = _this.$cls.get_attribute('Signature')) != null ? _ref5.sig : void 0;
    if (sig != null) {
      return rs.init_string(sig);
    } else {
      return null;
    }
  }), o('getProtectionDomain0()Ljava/security/ProtectionDomain;', function(rs, _this) {
    return null;
  }), o('isAssignableFrom(L!/!/!;)Z', function(rs, _this, cls) {
    return cls.$cls.is_castable(_this.$cls);
  }), o('isInterface()Z', function(rs, _this) {
    if (!(_this.$cls instanceof ReferenceClassData)) {
      return false;
    }
    return _this.$cls.access_flags["interface"];
  }), o('isInstance(L!/!/Object;)Z', function(rs, _this, obj) {
    return obj.cls.is_castable(_this.$cls);
  }), o('isPrimitive()Z', function(rs, _this) {
    return _this.$cls instanceof PrimitiveClassData;
  }), o('isArray()Z', function(rs, _this) {
    return _this.$cls instanceof ArrayClassData;
  }), o('getSuperclass()L!/!/!;', function(rs, _this) {
    if (_this.$cls instanceof PrimitiveClassData) {
      return null;
    }
    var cls = _this.$cls;
    if (cls.access_flags["interface"] || (cls.get_super_class() == null)) {
      return null;
    }
    return cls.get_super_class().get_class_object(rs);
  }), o('getDeclaredFields0(Z)[Ljava/lang/reflect/Field;', function(rs, _this, public_only: boolean) {
    var fields = _this.$cls.get_fields();
    if (public_only) {
      fields = fields.filter((f) => f.access_flags["public"]);
    }
    var base_array = [];
    rs.async_op(function(resume_cb, except_cb) {
      var i = -1;
      function fetch_next_field() {
        i++;
        if (i < fields.length) {
          fields[i].reflector(rs, (function(jco) {
            base_array.push(jco);
            return fetch_next_field();
          }), except_cb);
        } else {
          var field_arr_cls = rs.get_bs_class('[Ljava/lang/reflect/Field;');
          resume_cb(new JavaArray(rs, field_arr_cls, base_array));
        }
      };
      fetch_next_field();
    });
  }), o('getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;', function(rs, _this, public_only) {
    var base_array, m, methods, sig;

    methods = _this.$cls.get_methods();
    methods = (function() {
      var _results;

      _results = [];
      for (sig in methods) {
        m = methods[sig];
        if (sig[0] !== '<' && (m.access_flags["public"] || !public_only)) {
          _results.push(m);
        }
      }
      return _results;
    })();
    base_array = [];
    rs.async_op(function(resume_cb, except_cb) {
      var fetch_next_method, i;

      i = -1;
      fetch_next_method = function() {
        i++;
        if (i < methods.length) {
          m = methods[i];
          return m.reflector(rs, false, (function(jco) {
            base_array.push(jco);
            return fetch_next_method();
          }), except_cb);
        } else {
          return resume_cb(new JavaArray(rs, rs.get_bs_class('[Ljava/lang/reflect/Method;'), base_array));
        }
      };
      return fetch_next_method();
    });
  }), o('getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;', function(rs, _this, public_only) {
    var base_array, ctor_array_cdata, m, methods, sig;

    methods = _this.$cls.get_methods();
    methods = (function() {
      var _results;

      _results = [];
      for (sig in methods) {
        m = methods[sig];
        if (m.name === '<init>') {
          _results.push(m);
        }
      }
      return _results;
    })();
    if (public_only) {
      methods = (function() {
        var _i, _len, _results;

        _results = [];
        for (_i = 0, _len = methods.length; _i < _len; _i++) {
          m = methods[_i];
          if (m.access_flags["public"]) {
            _results.push(m);
          }
        }
        return _results;
      })();
    }
    ctor_array_cdata = rs.get_bs_class('[Ljava/lang/reflect/Constructor;');
    base_array = [];
    rs.async_op(function(resume_cb, except_cb) {
      var fetch_next_method, i;

      i = -1;
      fetch_next_method = function() {
        i++;
        if (i < methods.length) {
          m = methods[i];
          return m.reflector(rs, true, (function(jco) {
            base_array.push(jco);
            return fetch_next_method();
          }), except_cb);
        } else {
          return resume_cb(new JavaArray(rs, ctor_array_cdata, base_array));
        }
      };
      return fetch_next_method();
    });
  }), o('getInterfaces()[L!/!/!;', function(rs, _this) {
    var cls, iface, iface_objs, ifaces;

    cls = _this.$cls;
    ifaces = cls.get_interfaces();
    iface_objs = (function() {
      var _i, _len, _results;

      _results = [];
      for (_i = 0, _len = ifaces.length; _i < _len; _i++) {
        iface = ifaces[_i];
        _results.push(iface.get_class_object(rs));
      }
      return _results;
    })();
    return new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), iface_objs);
  }), o('getModifiers()I', function(rs, _this) {
    return _this.$cls.access_byte;
  }), o('getRawAnnotations()[B', function(rs, _this) {
    var annotations, cls, m, sig, _ref5;

    cls = _this.$cls;
    annotations = cls.get_attribute('RuntimeVisibleAnnotations');
    if (annotations != null) {
      return new JavaArray(rs, rs.get_bs_class('[B'), annotations.raw_bytes);
    }
    _ref5 = cls.get_methods();
    for (sig in _ref5) {
      m = _ref5[sig];
      annotations = m.get_attribute('RuntimeVisibleAnnotations');
      if (annotations != null) {
        return new JavaArray(rs, rs.get_bs_class('[B'), annotations.raw_bytes);
      }
    }
    return null;
  }), o('getConstantPool()Lsun/reflect/ConstantPool;', function(rs, _this) {
    var cls;

    cls = _this.$cls;
    return new JavaObject(rs, rs.get_bs_class('Lsun/reflect/ConstantPool;'), {
      'Lsun/reflect/ConstantPool;constantPoolOop': cls.constant_pool
    });
  }), o('getEnclosingMethod0()[L!/!/Object;', function(rs, _this) {
    var cls, em, enc_cls, enc_desc, enc_name;

    if (!(_this.$cls instanceof ReferenceClassData)) {
      return null;
    }
    cls = _this.$cls;
    em = cls.get_attribute('EnclosingMethod');
    if (em == null) {
      return null;
    }
    enc_cls = cls.loader.get_resolved_class(em.enc_class).get_class_object(rs);
    if (em.enc_method != null) {
      enc_name = rs.init_string(em.enc_method.name);
      enc_desc = rs.init_string(em.enc_method.type);
    } else {
      enc_name = null;
      enc_desc = null;
    }
    return new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Object;'), [enc_cls, enc_name, enc_desc]);
  }), o('getDeclaringClass()L!/!/!;', function(rs, _this) {
    var cls, declaring_name, entry, icls, my_class, name, _i, _len, _ref5;

    if (!(_this.$cls instanceof ReferenceClassData)) {
      return null;
    }
    cls = _this.$cls;
    icls = cls.get_attribute('InnerClasses');
    if (icls == null) {
      return null;
    }
    my_class = _this.$cls.get_type();
    _ref5 = icls.classes;
    for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
      entry = _ref5[_i];
      if (!(entry.outer_info_index > 0)) {
        continue;
      }
      name = cls.constant_pool.get(entry.inner_info_index).deref();
      if (name !== my_class) {
        continue;
      }
      declaring_name = cls.constant_pool.get(entry.outer_info_index).deref();
      return cls.loader.get_resolved_class(declaring_name).get_class_object(rs);
    }
    return null;
  }), o('getDeclaredClasses0()[L!/!/!;', function(rs, _this) {
    var c, cls, enclosing_name, flat_names, icls, iclses, my_class, ret, _i, _j, _len, _len1, _ref5;

    ret = new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), []);
    if (!(_this.$cls instanceof ReferenceClassData)) {
      return ret;
    }
    cls = _this.$cls;
    my_class = _this.$cls.get_type();
    iclses = cls.get_attributes('InnerClasses');
    if (iclses.length === 0) {
      return ret;
    }
    flat_names = [];
    for (_i = 0, _len = iclses.length; _i < _len; _i++) {
      icls = iclses[_i];
      _ref5 = icls.classes;
      for (_j = 0, _len1 = _ref5.length; _j < _len1; _j++) {
        c = _ref5[_j];
        if (!(c.outer_info_index > 0)) {
          continue;
        }
        enclosing_name = cls.constant_pool.get(c.outer_info_index).deref();
        if (enclosing_name !== my_class) {
          continue;
        }
        flat_names.push(cls.constant_pool.get(c.inner_info_index).deref());
      }
    }
    rs.async_op(function(resume_cb, except_cb) {
      var fetch_next_jco, i;

      i = -1;
      fetch_next_jco = function() {
        var name;

        i++;
        if (i < flat_names.length) {
          name = flat_names[i];
          return cls.loader.resolve_class(rs, name, (function(cls) {
            ret.array.push(cls.get_class_object(rs));
            return fetch_next_jco();
          }), except_cb);
        } else {
          return resume_cb(ret);
        }
      };
      return fetch_next_jco();
    });
  })
];

native_methods['java']['lang']['Runtime'] = [
  o('availableProcessors()I', function() {
    return 1;
  }), o('gc()V', function(rs) {
    return rs.async_op(function(cb) {
      return cb();
    });
  }), o('maxMemory()J', function(rs) {
    debug("Warning: maxMemory has no meaningful value in Doppio -- there is no hard memory limit.");
    return gLong.MAX_VALUE;
  })
];

function setup_caller_stack(rs, method, obj, params) {
  var i, p, p_type, primitive_value, _i, _len, _ref5;

  if (!method.access_flags["static"]) {
    rs.push(obj);
  }
  i = 0;
  _ref5 = method.param_types;
  for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
    p_type = _ref5[_i];
    p = params.array[i++];
    if (p_type === 'J' || p_type === 'D') {
      if ((p != null ? p.ref : void 0) != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push2(primitive_value, null);
      } else {
        rs.push2(p, null);
        i++;
      }
    } else if (util.is_primitive_type(p_type)) {
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
      ret_type = m.get_field(rs, 'Ljava/lang/reflect/Method;returnType');
      ret_descriptor = ret_type.$cls.get_type();
      if (util.is_primitive_type(ret_descriptor) && ret_descriptor !== 'V') {
        cleanup_runner = function() {
          var rv;

          rv = ret_descriptor === 'J' || ret_descriptor === 'D' ? rs.pop2() : rs.pop();
          rs.meta_stack().pop();
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
      if (cls.$cls.access_byte & 0x200) {
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
          return except_cb(function() {
            method.setup_stack(rs);
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
    o('getCallerClass(I)Ljava/lang/Class;', function(rs, frames_to_skip) {
      var caller, cls;

      caller = rs.meta_stack().get_caller(frames_to_skip);
      if (caller.name.indexOf('Ljava/lang/reflect/Method;::invoke') === 0) {
        caller = rs.meta_stack().get_caller(frames_to_skip + 1);
      }
      cls = caller.method.cls;
      return cls.get_class_object(rs);
    }), o('getClassAccessFlags(Ljava/lang/Class;)I', function(rs, class_obj) {
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
