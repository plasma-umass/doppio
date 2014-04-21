import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');

class java_nio_Bits {

  public static 'copyFromByteArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyFromShortArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToShortArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyFromIntArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToIntArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyFromLongArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToLongArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_nio_MappedByteBuffer {

  public static 'isLoaded0(JJI)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong, arg2: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'load0(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'force0(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

({
  'java/nio/Bits': java_nio_Bits,
  'java/nio/MappedByteBuffer': java_nio_MappedByteBuffer
})
