win = window

root = win.node = {}
basename = (path) -> path.split('/').pop()
win.require = (path) ->
  [name, ext] = basename(path).split '.'
  window[name] ?= {}

_ = require '../vendor/_.js'

"use strict"

# IE9 and below only: Injects a VBScript function that converts the
# 'responseBody' attribute of an XMLHttpRequest into a bytestring.
# Credit: http://miskun.com/javascript/internet-explorer-and-binary-files-data-access/#comment-11
inject_vbscript = ->
  IEBinaryToArray_ByteStr_Script =
    "<!-- IEBinaryToArray_ByteStr -->\r\n"+
    "<script type='text/vbscript'>\r\n"+
    "Function IEBinaryToArray_ByteStr(Binary)\r\n"+
    "   IEBinaryToArray_ByteStr = CStr(Binary)\r\n"+
    "End Function\r\n"+
    "Function IEBinaryToArray_ByteStr_Last(Binary)\r\n"+
    "   Dim lastIndex\r\n"+
    "   lastIndex = LenB(Binary)\r\n"+
    "   if lastIndex mod 2 Then\r\n"+
    "       IEBinaryToArray_ByteStr_Last = Chr( AscB( MidB( Binary, lastIndex, 1 ) ) )\r\n"+
    "   Else\r\n"+
    "       IEBinaryToArray_ByteStr_Last = "+'""'+"\r\n"+
    "   End If\r\n"+
    "End Function\r\n"+
    "</script>\r\n"

  document.write(IEBinaryToArray_ByteStr_Script)

# Run once at JavaScript load time.
if $.browser.msie and not window.Blob
  inject_vbscript()

# Converts 'responseBody' in IE into the equivalent 'responseText' that other
# browsers would generate.
GetIEByteArray_ByteStr = (IEByteArray) ->
  rawBytes = IEBinaryToArray_ByteStr(IEByteArray);
  lastChr = IEBinaryToArray_ByteStr_Last(IEByteArray);
  return rawBytes.replace(/[\s\S]/g,
    ((match) ->
      v = match.charCodeAt(0)
      return String.fromCharCode(v&0xff, v>>8)
    )) + lastChr

# Our 'file descriptor'
class DoppioFile
  @fromJSON: (path, rawData) ->
    data = JSON.parse rawData
    new DoppioFile(path, data.data, data.mtime)

  constructor: (@path, @data = "", @mtime = (new Date).getTime(), @mod = false, @mode = 0o644) ->

  read: (length, pos) ->
    return @data unless length?
    @data.substr(pos, length)

  write: (newData, pos) ->
    @mod = true
    if pos? and pos < @data.length
      @data = @data.slice(0,pos) + newData + @data.slice(pos+newData.length)
    else
      @data += newData
    return @

  toJSON: ->
    JSON.stringify
      data: @data
      mtime: @mtime

# Helper object. Used by some FileSources to maintain an index of files.
class FileIndex
  constructor: (@index = {}) ->

  # Get subcomponents of the given path.
  _subcomponents: (path) ->
    components = path.split '/'
    # Get rid of first slash
    components.shift()
    # Special case: Root
    if components.length == 1 and components[0] == '' then [] else components
  _add_file: (components, fname, file) ->
    dir = @_mkdir(components)
    dir[fname] = file
    return
  _mkdir: (components) ->
    cur_dir = @index
    for c in components
      cur_dir[c] ?= {}
      cur_dir = cur_dir[c]
    return cur_dir
  _get: (components) ->
    cur_dir = @index
    for c in components
      return false unless c of cur_dir
      cur_dir = cur_dir[c]
    return cur_dir
  _is_directory: (obj) -> obj? and !(obj instanceof DoppioFile)

  # Add the given file to the index. Implicitly creates directories if needed
  # and overwrites things without checking.
  add_file: (path, file) ->
    components = @_subcomponents(path)
    fname = components.pop()
    @_add_file(components, fname, file)
    return
  # Retrieves the given file. Returns 'false' if the file does not exist, or if
  # it is a directory. Otherwise, returns the file (which may be null).
  get_file: (path) ->
    components = @_subcomponents(path)
    f = @_get(components)
    return f unless f is false or @_is_directory(f)
    return false
  # Returns a directory listing, or null if the directory does not exist.
  ls: (path) ->
    components = @_subcomponents(path)
    dir = @_get(components)
    return Object.keys(dir) unless dir is false or !@_is_directory(dir)
    return null
  # Makes the given directory. Implicitly creates needed subdirectories.
  mkdir: (path) ->
    components = @_subcomponents(path)
    @_mkdir(components)
    return
  # Returns the parent directory of path or false.
  parent: (path) ->
    components = @_subcomponents(path)
    components.pop()
    return @_get components
  # Removes the given path, directory or not, from the index. This is a
  # recursive delete. Returns the paths to the files that were deleted if this
  # was a directory, otherwise returns true if a file was deleted, false if
  # the path did not exist.
  rm: (path) ->
    components = @_subcomponents(path)
    name = components.pop()
    parent = @_get(components)
    ret = false
    if parent? and parent != false
      if parent[name]?
        obj = parent[name]
        ret = if @_is_directory(obj) then Object.keys(obj) else true
        delete parent[name]
    return ret


# Interface for a FileSource. Somewhat of a misnomer, as they are also sinks...
class FileSource
  # Set to 'true' if this FileSource is redundant to another in some way.
  # This signals that it should be written to / deleted from, even if another
  # applicable source has an identical file or directory path
  redundant_storage: false
  # A handy method for sources that store/retrieve data using a relative file
  # name.
  _trim_mnt_pt: (path) -> path.slice(@mnt_pt.length)

  constructor: (@mnt_pt) ->

  # INTERFACE METHODS
  # Fetches file at path; DoppioFile for success, null for failure.
  fetch: (path) -> null
  # Stores file to path; true for success, false for failure.
  store: (path, file) -> false
  # Removes the file or folder at the given path. Returns true for success.
  # If there are files in the folder, it automatically recurses.
  rm: (path) -> false
  # Returns a directory listing for the given path, or null if it does not
  # exist.
  ls: (path) -> null
  # Moves a file or directory from path1 to path2. Returns true on success,
  # false otherwise.
  mv: (path1, path2, isFile = true) -> false
  mkdir: (path1) -> false

# Composes multiple file sources into one file source. Prioritizes file sources
# in the order in which they are added.
class CompositedFileSource extends FileSource
  # Returns 'true' if the given path is in the given mount point.
  _in_mnt_pt: (path, mnt_pt) -> mnt_pt == '/' or path == mnt_pt or (path.slice(0, mnt_pt.length) == mnt_pt and path[mnt_pt.length] == '/')
  _get_applicable_sources: (path) ->
    applicable = []
    for a_mnt_pt in @mnt_pts
      applicable.push(@sources[a_mnt_pt]) if @_in_mnt_pt(path, a_mnt_pt)
    return applicable

  constructor: (mnt_pt, inpt_sources = []) ->
    super(mnt_pt)
    @sources = {}
    @mnt_pts = []
    @redundant_storage = false
    for source in inpt_sources
      @add_source(source)

  add_source: (source) ->
    @sources[source.mnt_pt] = source
    @mnt_pts.push(source.mnt_pt)
    @redundant_storage ||= source.redundant_storage
    return

  fetch: (path) ->
    applicable = @_get_applicable_sources(path)
    for parent in applicable
      f = parent.fetch(path)
      return f if f?
    return null

  store: (path, file) ->
    applicable = @_get_applicable_sources(path)
    stored = false
    for source in applicable
      stored = source.store(path, file) || stored unless stored and !source.redundant_storage
    return stored

  rm: (path) ->
    applicable = @_get_applicable_sources(path)
    removed = false
    for source in applicable
      removed = source.rm(path) || removed unless removed and !source.redundant_storage
    return removed

  ls: (path) ->
    applicable = @_get_applicable_sources(path)
    # Initialize to 'null' so that we return 'null' if the path is not present
    # in any applicable FileSources. Note that 'null' != [], as the latter is
    # an existing-but-empty directory.
    list = null
    for source in applicable
      src_list = source.ls(path)
      if src_list?
        list = if list? then _.union(list, src_list) else src_list
    return list

  mv: (path1, path2, isFile = true) ->
    applicable = @_get_applicable_sources(path1)
    moved = false
    for source in applicable
      moved = source.mv(path1, path2, isFile) || moved
    return moved

  mkdir: (path) ->
    applicable = @_get_applicable_sources path
    dirmade = false
    for source in applicable
      dirmade ||= source.mkdir path
    return dirmade

class LocalStorageSource extends FileSource
  redundant_storage: true
  constructor: (mnt_pt) ->
    super(mnt_pt)
    # Index of all files in LS.
    @index = new FileIndex()
    # Initialize index w/ LS files and directories.
    for path of localStorage
      @index.add_file(path, null)

  fetch: (path) -> if localStorage[path]? then DoppioFile.fromJSON(path, localStorage[path]) else null
  store: (path, file) ->
    # XXX: Don't store if a temporary file.
    if file.mod and not file.temp
      localStorage[path] = file.toJSON()
      @index.add_file(path, file)
    true
  rm: (path) ->
    listing = @index.rm(path)
    if typeof listing != 'boolean'
      for item in listing
        itPath = path + '/' + item
        delete localStorage[itPath]
    else if localStorage[path]?
      delete localStorage[path]
    else
      return false
    return true

  ls: (path) -> @index.ls(path)
  mv: (path1, path2, isFile = true) ->
    if isFile
      file1_obj = @fetch(path1)
      return false unless file1_obj? and @rm path1
      file1_obj.path = path2
      #XXX: Bit of a hack.
      file1_obj.mod = true
      @store path2, file1_obj
    else
      file1_ls = @index.ls(path1)
      return false unless file1_ls?
      # Make path2.
      @index.mkdir path2
      # Move every file from p1 to p2.
      for f_name in file1_ls
        @mv f_name, path2 + f_name.substr(path1.length), true
      # Delete p1.
      @index.rm path1
    return true
  mkdir: (path) ->
    return false unless @index.parent path
    @index.mkdir(path)
    return true

class WebserverSource extends FileSource
  _download_file: (path) ->
    # Ensure the file is in the index.
    return null if @index? and @index.get_file(@mnt_pt + path) == false
    data = null

    # The below code is complicated because we can't do a 'text' request in IE;
    # it truncates the response at the first NULL character.

    if not $.browser.msie
      $.ajax path, {
        type: 'GET'
        dataType: 'text'
        async: false
        beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
        success: (theData, status, jqxhr) -> data = theData
      }
    # IE 10+ path
    else if window.Blob
      # In IE10, we can do a 'blob' request to get a binary blob that we can
      # convert into a string.
      # jQuery's 'ajax' function does not support blob requests, so we're going
      # to use XMLHttpRequest directly.
      # Furthermore, the code below will *NOT* work in Firefox or Chrome, since
      # they do not allow synchronous blob or arraybuffer requests.
      req = new XMLHttpRequest()
      req.open('GET', path, false)
      req.responseType = 'arraybuffer'
      req.send()
      if req.status == 200
        typed_array = new Uint8Array(req.response)
        array = []
        for char, i in typed_array
          array[i] = String.fromCharCode(char)
        data = array.join("")
    # IE < 10 path
    else
      # In earlier versions of IE, we can retrieve the 'responseBody'
      # attribute of the response (which contains the *entire* response).
      # Since it's an unsigned array, JavaScript can't touch it, so we
      # pass it to VBScript code that can convert it into something
      # JavaScript can process.
      # Note that this approach also works in IE10 for x86 platforms, but
      # not for ARM platforms which do not have VBScript support.
      req = new XMLHttpRequest()
      req.open('GET', path, false)
      req.setRequestHeader("Accept-Charset", "x-user-defined")
      req.send()
      if req.status == 200
        data = GetIEByteArray_ByteStr(req.responseBody)

    return data
  constructor: (mnt_pt, listings_path) ->
    super(mnt_pt)
    if listings_path?
      idx_data = @_download_file(listings_path)
    @index = new FileIndex(if idx_data? then JSON.parse(idx_data) else )
  fetch: (path) ->
    trim_path = @_trim_mnt_pt(path)
    data = @_download_file(trim_path)
    return if data? then new DoppioFile(path, data) else null
  ls: (path) -> @index.ls(path)

# Wraps another FileSource and acts as its cache.
class CacheSource extends FileSource
  constructor: (mnt_pt, src) ->
    super(mnt_pt)
    @src = src
    @redundant_storage = src.redundant_storage
    @index = new FileIndex()
  fetch: (path) ->
    f = @index.get_file(path)
    if f == false
      f = @src.fetch(path)
      @index.add_file(path, f) if f?
    return f
  store: (path, file) ->
    if @src.store(path, file)
      @index.add_file(path, file)
      return true
    return false
  rm: (path) ->
    if @src.rm(path)
      @index.rm(path)
      return true
    return false
  ls: (path) -> @src.ls(path)
  mkdir: (path) -> @src.mkdir(path)
  # ignoreSrc is used internally only.
  mv: (file1, file2, isFile = true, ignoreSrc = false) ->
    success = if ignoreSrc then true else @src.mv file1, file2, isFile
    # Move any cached copies.
    if isFile
      f = @index.get_file file1
      if f
        f.path = file2
        @index.rm file1
        @index.add_file file2, f
    else
      ls = @index.ls file1
      for f_name in ls
        @mv f_name, path2 + f_name.substr(path1.length), true, true
      @index.rm file1
    return success

# Stores the File System's current state.
class FSState
  constructor: ->
    # Files fetched from webserver are always represented internally as relative
    # to home.
    #(mnt_pt, inpt_sources = [])
    @home = '/home/doppio'
    @pwd = @home
    mainSource = new CompositedFileSource('/', [new LocalStorageSource('/'), new WebserverSource('/home/doppio', '/browser/listings.json')])
    @files = new CacheSource('/', mainSource)
    # Slight cheat; ensures that / and /home exist.
    f = new DoppioFile('/home/doppio/Hello.txt', "Welcome to Doppio!")
    f.mod = true
    @files.store '/home/doppio/Hello.txt', f

  # Canonicalizes the given path.
  resolve: (path) ->
    components = path.split '/'
    absolute = path[0] == '/'
    for c, idx in components
      components[idx] = '' if c == '.'
      components[idx] = @home if c == '~'
    if !absolute
      pwdCmps = @pwd.split '/'
      for i in [pwdCmps.length - 1..0] by -1
        components.unshift(pwdCmps[i])
    for c, idx in components
      if c == '..'
        processed = false
        i = idx-1
        while !processed
          if i < 0 then processed = true
          if components[i] != ''
            components[i] = ''
            components[idx] = ''
            processed = true
          i--
    # remove repeated //s
    path = (c for c, idx in components when c != '').join '/'
    if path[0] != '/'
      path = '/' + path
    return path

  # Retrieves a file from the file system. Creates a new one if needed.
  # Mode is 'r' for read, 'w' for write+read, 'a' for append+read
  # Returns 'null' if file does not exist.
  open: (path, mode = 'r') ->
    path = @resolve path
    return null if @is_directory(path)
    # Start fresh.
    if mode == 'w'
      f = new DoppioFile(path)
      # Ensure writeback when closed.
      f.mod = true
      return f
    return @files.fetch path

  close: (file) -> @files.store(file.path, file); file.mod = false; return

  list: (path) -> @files.ls(@resolve path)

  is_file: (path) -> @files.fetch(@resolve path)?

  is_directory: (path) -> @list(path)?

  rm: (path, isDir = false) ->
    path = @resolve path
    if @is_directory(path) != isDir then false else @files.rm(path)

  chdir: (dir) ->
    dir = @resolve(dir)
    if @is_directory dir
      @pwd = dir
      dir
    else
      null

  mkdir: (dir) ->
    dir = @resolve(dir)
    return false if @is_directory dir or @is_file dir
    return @files.mkdir dir

  mv: (file1, file2) ->
    file1 = @resolve file1
    file2 = @resolve file2
    return @files.mv file1, file2


# Currently a singleton.
fs_state = new FSState()

################################################################################
# NODE EMULATION
################################################################################

class Stat
  @fromPath: (path) ->
    #XXX: Hack.
    return null if path == ''
    if fs_state.is_directory path
      stat = new Stat
      stat.size = 1
      stat.mtime = (new Date).getTime()
      stat.is_file = false
      stat.is_directory = true
      #XXX: Shhhh...
      stat.mode = 0o644
      stat
    else
      file = fs_state.open path, 'r'
      return null unless file?
      new Stat file

  constructor: (@file) ->
    if @file?
      @size = @file.data.length
      @mtime = @file.mtime
      @is_file = true
      @is_directory = false
      @mode = @file.mode

  isFile: -> @is_file

  isDirectory: -> @is_directory

# This is a global in Node.JS
class win.Buffer
  constructor: (obj) ->
    if obj instanceof Array
      @array = obj
    else # assume num
      @array = new Array obj

  readUInt8: (i) -> @array[i] & 0xFF  # cast to unsigned byte
  readInt8: (i) -> @array[i]

# Node's filesystem API, implemented as a wrapper around FSState.
root.fs =
  statSync: (path) -> Stat.fromPath path
  stat: (path, cb) ->
    setTimeout (()->
      cb null, node.fs.statSync(path)
    ), 0

  fstatSync: (fp) -> new Stat(fp)

  openSync: (path, mode) ->
    # 'r' - Open file for reading. An exception occurs if the file does not exist.
    # 'w' - Open file for writing. The file is created (if it does not exist) or truncated (if it exists).
    # 'a' - Open file for appending. The file is created if it does not exist.
    # Normalize 'mode' to the three we care about
    if 'w' in mode then mode = 'w'
    else if 'a' in mode then mode = 'a'
    else mode = 'r'
    f = fs_state.open(path, mode)
    unless f?
      err = new Error
      err.code = 'ENOENT'
      throw err
    f

  open: (path, mode, cb) ->
    # mode is optional
    unless cb?
      cb = mode
      mode = 'r'
    setTimeout (() ->
      try
        f = node.fs.openSync path, mode
        cb null, f
      catch e
        cb e
    ), 0

  readSync: (fd, buf, offset, length, pos) ->
    data = fd.read(length, pos)
    for d, i in data
      buf.array[offset+i] = data.charCodeAt(i) & 0xFF
    data.length

  readFileSync: (path) ->
    f = fs_state.open(path, 'r')
    throw "File does not exist." unless f?
    return f.data

  readFile: (path, cb) ->
    setTimeout (() ->
      try
        data = node.fs.readFileSync path
        cb null, data
      catch e
        cb e
    ), 0

  # XXX: Temp option prevents writeback to permanent storage. This is not in the
  #      Node API, and is used as a way for the browser to create temp files.
  writeFileSync: (path, data, temp) ->
    f = fs_state.open(path, 'w')
    f.temp = temp == true
    f.write(data)
    fs_state.close(f)

  writeFile: (path, data, cb) ->
    setTimeout (() ->
      cb null, node.fs.writeFileSync(path, data)
    ), 0

  writeSync: (fd, buffer, offset, len, pos) ->
    # TODO flush occasionally?
    # structure borrowed from the Node.js source
    if buffer.readUInt8?
      str = (String.fromCharCode(buffer.readUInt8(i)) for i in [offset...offset+len] by 1).join ''
    else  # old-style API where buffer is a string
      str = '' + buffer
      pos = offset
    fd.write(str, pos)

  closeSync: (fd) -> fs_state.close(fd)
  close: (fd, cb) -> setTimeout (()->node.fs.closeSync fd; cb()), 0

  readdirSync: (path) ->
    dir_contents = fs_state.list(path)
    throw "Could not read directory '#{path}'" unless dir_contents? and path != ''
    return dir_contents

  readdir: (path, cb) ->
    setTimeout (()->
      try
        files = node.fs.readdirSync path
        cb null, files
      catch e
        cb e
    ), 0

  unlinkSync: (path) -> throw "Could not unlink '#{path}'" unless fs_state.rm(path)
  unlink: (path, cb) ->
    setTimeout (()->
      try
        node.fs.unlinkSync path
        cb()
      catch e
        cb e
    ), 0
  rmdirSync: (path) -> throw "Could not delete '#{path}'" unless fs_state.rm(path, true)
  rmdir: (path, cb) ->
    setTimeout (()->
      try
        node.fs.rmdirSync path
        cb()
      catch e
        cb e
    ), 0

  existsSync: (path) -> path != '' and (fs_state.is_file(path) or fs_state.is_directory(path))
  exists: (path, cb) ->
    setTimeout (()->
      cb null, node.fs.existsSync(path)
    ), 0

  mkdirSync: (path) -> throw "Could not make directory #{path}" unless fs_state.mkdir path
  mkdir: (path, cb) ->
    setTimeout (()->
      try
        node.fs.mkdirSync path
        cb()
      catch e
        cb e
    ), 0

  renameSync: (path1, path2) -> throw "Could not rename #{path1} to #{path2}" unless fs_state.mv path1, path2
  rename: (path1, path2, cb) ->
    setTimeout (()->
      try
        node.fs.renameSync path1, path2
        cb()
      catch e
        cb e
    ), 0

  #XXX: Does not work for directory permissions.
  chmodSync: (path, access) ->
    throw "File #{path1} does not exist." unless fs_state.is_file path
    f = fs_state.open path, 'r'
    f.mod = true
    f.mode = access
    fs_state.close f
    return true
  chmod: (path, access, cb) ->
    setTimeout (()->
      try
        rv = node.fs.chmodSync path
        cb null, rv
      catch e
        cb e
    ), 0

  utimesSync: (path, atime, mtime) ->
    #XXX: this is a NOP, but it shouldn't be. We need to fix the way we stat files first
  utimes: (path, atime, mtime, cb) ->
    setTimeout cb, 0

# Node's Path API
root.path =
  normalize: (path) -> path
  resolve: (parts...) -> fs_state.resolve parts.join '/'
  basename: (path, ext) ->
    base = path.replace(/^.*[\/\\]/, '')
    if ext?.length? and base[base.length-ext.length..] == ext
      base = base[...base.length-ext.length]
    base
  extname: (path) -> path.replace(/^.*(\..*)/, '$1')

root.process =
  cwd: -> fs_state.pwd
  chdir: (dir) ->
    absdir = fs_state.chdir dir
    throw "Invalid directory" unless absdir?
    absdir
