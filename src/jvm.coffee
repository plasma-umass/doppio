"use strict"

# pull in external modules
util = require './util'
fs = node?.fs ? require 'fs'
path = node?.path ? require 'path'
{trace,error} = require '../src/logging'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

root.show_NYI_natives = false
root.dump_state = false

vendor_path = if node?  # node is only defined if we're in the browser
  '/home/doppio/vendor'
else
  path.resolve __dirname, '../vendor'

root.reset_system_properties = () ->
  root.system_properties = {
    'java.class.path': [],
    'java.home': "#{vendor_path}/java_home",
    'sun.boot.class.path': "#{vendor_path}/classes",
    'file.encoding':'UTF-8','java.vendor':'Doppio',
    'java.version': '1.6', 'java.vendor.url': 'https://github.com/int3/doppio',
    'java.class.version': '50.0',
    'java.specification.version': '1.6',
    'line.separator':'\n', 'file.separator':'/', 'path.separator':':',
    'user.dir': path.resolve('.'),'user.home':'.','user.name':'DoppioUser',
    'os.name':'doppio', 'os.arch': 'js', 'os.version': '0',
    'java.vm.name': 'Doppio 64-bit VM', 'java.vm.vendor': 'Doppio Inc.',
    'java.awt.headless': (not node?).toString(),  # true if we're using the console frontend
    'java.awt.graphicsenv': 'classes.awt.CanvasGraphicsEnvironment',
    'useJavaUtilZip': 'true',  # hack for sun6javac, avoid ZipFileIndex shenanigans
    'jline.terminal': 'jline.UnsupportedTerminal' # we can't shell out to `stty`
  }

# initialize the sysprops on module load
root.reset_system_properties()

root.read_classfile = (cls, cb, failure_cb) ->
  cls = cls[1...-1] # Convert Lfoo/bar/Baz; -> foo/bar/Baz.
  for p in root.system_properties['java.class.path']
    filename = "#{p}/#{cls}.class"
    try
      continue unless fs.existsSync filename
      data = util.bytestr_to_array fs.readFileSync(filename, 'binary')
      cb(data) if data?
      return
    catch e
      failure_cb(()->throw e) # Signifies an error occurred.
      return

  failure_cb (()->throw new Error "Error: No file found for class #{cls}.")

# Sets the classpath to the given value in typical classpath form:
# path1:path2:... etc.
# jcl_path is the location of the Java Class Libraries. It is the only path
# that is implicitly the last item on the classpath.
# Standardizes the paths for JVM usage.
# XXX: Should make this asynchronous at some point for checking the existance
#      of classpaths.
root.set_classpath = (jcl_path, classpath) ->
  classpath = classpath.split(':')
  classpath.push jcl_path
  root.system_properties['java.class.path'] = tmp_cp = []
  # All paths must:
  # * Exist.
  # * Be a the fully-qualified path.
  # * Have a trailing /.
  for class_path in classpath
    class_path = path.normalize class_path
    if class_path.charAt(class_path.length-1) != '/'
      class_path += '/'
    # XXX: Make this asynchronous sometime.
    if fs.existsSync(class_path)
      tmp_cp.push(class_path)
  return

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  class_descriptor = "L#{class_name};"
  main_sig = 'main([Ljava/lang/String;)V'
  main_method = null
  run_main = ->
    trace "run_main"
    rs.run_until_finished (->
      rs.async_op (resume_cb, except_cb) ->
        rs.get_bs_cl().initialize_class rs, class_descriptor, ((cls)->
          rs.init_args cmdline_args
          # wrap it in run_until_finished to handle any exceptions correctly
          rs.run_until_finished(
            (->
              main_method = cls.method_lookup rs, main_sig
              return if main_method?
              rs.async_op (resume_cb, except_cb) ->
                # we call except_cb on success because it doesn't pop the callstack
                cls.resolve_method rs, main_sig, ((m)-> main_method = m; except_cb(->)), except_cb
            ), true, (success) ->
              return done_cb?(success) unless success and main_method?
              rs.run_until_finished (-> main_method.setup_stack(rs)), false, (success) ->
                done_cb?(success and not rs.unusual_termination)
          )
        ), except_cb
    ), true, done_cb

  run_program = ->
    trace "run_program"
    rs.run_until_finished (-> rs.init_threads()), true, (success) ->
      return unless success
      if rs.system_initialized?
        run_main()
      else
        rs.run_until_finished (-> rs.init_system_class()), true, (success) ->
          return unless success
          run_main()

  rs.run_until_finished (->
    rs.async_op (resume_cb, except_cb) ->
      rs.preinitialize_core_classes run_program, ((e)->
        # Error during preinitialization? Abort abort abort!
        throw e
      )
  ), true, (->)
