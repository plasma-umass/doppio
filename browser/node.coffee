win = window

root = win.node = {}

"use strict"

# Our 'file descriptor'
class DoppioFile
  @fromJSON: (path, rawData) ->
    data = JSON.parse rawData
    new DoppioFile(path, data.data, data.mtime)

  constructor: (@path, @data = "", @mtime = (new Date).getTime(), @mod = false) ->

  read: (length, pos) ->
    return @data unless length?
    @data.substr(pos, length)

  # TODO: We only append to the end of files...
  write: (newData) -> @mod = true; @data += newData; @

  toJSON: ->
    JSON.stringify
      data: @data
      mtime: @mtime

class WebserverLayer
  constructor: (@parent) ->
  create: (path) -> null
  fetch: (path) ->
    file = null
    $.ajax path, {
      type: 'GET'
      dataType: 'text'
      async: false
      beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
      success: (data) -> file = new DoppioFile(path, data)
    }
    return file
  store: (fd) -> null
  rm: (path, isDir = false) -> false
  list: (path) -> null

# MountLayer will only pass filepaths and filedescriptors to its parent if they
# are for files/directories under the given mountPoint. It will then strip the
# mountpoint from the filepath, so the parent can pretend it's the root.
# TODO: DoppioFiles have paths, so the 'store' operation would mess things
#       up... do we need the path stored in the DoppioFile object? :|
class MountLayer
  constructor: (@parent, @mountPoint) ->
  # For mountPoint foo/bar, must return true for foo/bar and foo/bar/baz, but false for foo/bars
  isUnderMount: (path) -> (path.substr(0, @mountPoint.length) == @mountPoint) and (path.length == @mountPoint.length or path.charAt(@mountPoint.length) == '/')
  removeMount: (path) -> return path.substr(@mountPoint.length)
  create: (path) -> if @isUnderMount path then @parent.create(@removeMount path) else null
  fetch: (path) ->
    file = null
    if @isUnderMount path
      file = @parent.fetch(@removeMount path)
      file.path = @mountPoint + file.path
    file
  store: (fd) -> if @isUnderMount fd.path then @parent.store(fd) else false
  rm: (path, isDir = false) -> if @isUnderMount path then @parent.rm(@removeMount path, isDir) else false
  list: (path) -> if @isUnderMount path then @parent.list(@removeMount path) else null

class LocalStorageLayer
  constructor: (@parent) ->
    @dirs = []
    # Initialize @dirs w/ LS files and directories.
    for file of localStorage
      lastSlash = file.lastIndexOf('/')
      path = file.slice(0, lastSlash)
      fname = file.slice(lastSlash+1)
      @_make_subdirs(path, fname)
  _make_subdirs: (path, file) ->
    if !@dirs[path]?
      @dirs[path] = @parent.list(path)
      if !@dirs[path]? then @dirs[path] = []
      if lastSlash > 0
        lastSlash = path.lastIndexOf('/')
        subpath = path.slice(0, lastSlash)
        dname = path.slice(lastSlash+1)
        @_make_subdirs(subpath, dname)
    if file? and !(file in @dirs[path]) then @dirs[path].push(file)
    return
  create: (path) -> # NOP; we only create when a file is actually 'stored'.
  fetch: (path) ->
    if path in localStorage
      return DoppioFile.fromJSON(path, localStorage[path])
    else
      return @parent.fetch(path)
  store: (fd) ->
    localStorage[fd.path] = fd.toJSON()
    fpath = fd.path
    lastSlash = fpath.lastIndexOf('/')
    path = fpath.slice(0, lastSlash)
    fname = fpath.slice(lastSlash+1)
    @_make_subdirs(path, fname)
    true
  rm: (path, isDir = false) ->
    if isDir
      if @dirs[path]?
        for file in @dirs[path]
          @rm(path + '/' + file)
        delete @dirs[path]
        return true
    else if path in localStorage
      delete localStorage[path]
      return true
    return false
  list: (path) -> if @dirs[path]? then @dirs[path] else @parent.list(path)

# A layer that caches everything in memory. Only notifies the lower layer if:
# * A file is 'stored'.
# * A file is 'deleted'.
# * A file is requested that has not been requested before.
class MemoryLayer
  constructor: (@parent) ->
    @files = []
    @dirs = []
  _make_subdirs: (path, file) ->
    if path == '' then path = '/'
    if !@dirs[path]?
      @dirs[path] = @parent.list(path)
      if !@dirs[path]? then @dirs[path] = []
      lastSlash = path.lastIndexOf('/')
      if lastSlash >= 0 and path.length > 1
        subpath = path.slice(0, lastSlash)
        dname = path.slice(lastSlash+1)
        @_make_subdirs(subpath, dname)
    if file? and !(file in @dirs[path]) then @dirs[path].push(file)
    return
  create: (path, file = new DoppioFile(path)) ->
    lastSlash = path.lastIndexOf('/')
    dir = path.slice(0, lastSlash)
    fname = path.slice(lastSlash+1)
    if !@dirs[dir]? then @_make_subdirs(dir)
    @dirs[dir].push(fname)
    @files[path] = file
    return @files[path]
  fetch: (path) ->
    if @files[path]?
      return @files[path]
    else
      f = @parent.fetch(path)
      if f? then @create(path, f)
      return f
  store: (fd) ->
    # ASSUMPTION: 'fd' was retrieved via 'create' or 'fetch'. Otherwise, the
    # directories will be out of sync.
    @files[fd.path] = fd
    @parent.store(fd)
  rm: (path, isDir = false) ->
    if isDir
      if @dirs[path]?
        for file in @dirs[path]
          @rm(path + "/" + file)
        delete @dirs[path]
        @parent.rm(path, true)
        return true
    else if @files[path]?
      delete @files[path]
      @parent.rm(path)
      return true
    return @parent.rm(path, isDir)
  list: (path) -> if @dirs[path]? then @dirs[path] else @parent.list(path)

# Stores the File System's current state. Manages access to the localStorage
# cache, in-memory files, and files on the server.
# Separated from the emulated node modules so it can easily be used across
# various classes in this file.
class FSState
  constructor: ->
    # Files fetched from webserver are always represented internally as relative
    # to home.
    @home = '/home/doppio'
    @pwd = @home
    # We look in Memory -> LocalStorage -> Webserver for files.
    @files = new MemoryLayer(new LocalStorageLayer(new MountLayer(new WebserverLayer(), @home)))

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
  open: (path, createIfNonexistent = false) ->
    path = @resolve path
    f = @files.fetch path
    if !f?
      if createIfNonexistent
        f = @files.create(path)
      else
        return null
    f

  close: (fd) -> if fd.mod then @files.store(fd); fd.mod = false

  list: (path) ->
    path = @resolve path
    @files.list(path)

  is_file: (path) ->
    path = @resolve path
    @files.fetch(path)?

  is_directory: (path) ->
    path = @resolve path
    @files.list(path)?

  rm: (path, isDir = false) ->
    path = @resolve path
    @files.rm(path, isDir)

  chdir: (dir) ->
    dir = @resolve(dir)
    if @is_directory dir
      @pwd = dir
      dir
    else
      null


# Currently a singleton.
fs_state = new FSState()

################################################################################
# NODE EMULATION
################################################################################

class Stat
  @fromPath: (path) ->
    if fs_state.is_directory path
      stat = new Stat
      stat.size = 1
      stat.mtime = (new Date).getTime()
      stat.is_file = false
      stat.is_directory = true
      stat
    else
      file = fs_state.open path
      return null unless file?
      new Stat file

  constructor: (@file) ->
    if @file?
      @size = @file.data.length
      @mtime = @file.mtime
      @is_file = true
      @is_directory = false

  isFile: -> @is_file

  isDirectory: -> @is_directory

# This is a global in Node.JS
class win.Buffer
  constructor: (obj) ->
    if obj instanceof Array
      @array = obj
    else # assume num
      @array = new Array obj

  readUInt8: (i) -> util.int2uint @array[i], 1

# Node's filesystem API, implemented as a wrapper around FSState.
root.fs =
  statSync: (path) ->
    path = fs_state.resolve path
    # XXX: Hack.
    unless path is '/System/Library/Frameworks/JavaVM.framework/Classes/classes.jar'
      return Stat.fromPath path
    stat = new Stat
    stat.size = 21090
    stat.mtime = (new Date).getTime() - 10000
    stat.is_file = true
    stat.is_directory = false
    stat

  fstatSync: (fp) -> new Stat(fp)

  openSync: (path, mode) ->
    # XXX: Assuming write if no 'r'.
    f = fs_state.open(path, 'r' not in mode)
    unless f?
      err = new Error
      err.code = 'ENOENT'
      throw err
    f

  readSync: (fd, buf, offset, length, pos) ->
    data = fd.read(length, pos)
    for d, i in data
      buf.array[offset+i] = data.charCodeAt(i) & 0xFF
    data.length

  readFileSync: (path) ->
    f = fs_state.open(path)
    throw "File does not exist." if !f?
    return f.data

  writeFileSync: (path, data) ->
    f = fs_state.open(path, true)
    f.write(data)
    fs_state.close(f)

  writeSync: (fd, buffer, offset, len) ->
    # TODO flush occasionally?
    fd.write(String.fromCharCode(buffer.readUInt8(i) for i in [offset...offset+len] by 1).join '')

  closeSync: (fd) -> fs_state.close(fd)

  readdirSync: (path) ->
    dir_contents = fs_state.list(path)
    throw "Could not read directory '#{path}'" unless dir_contents
    return dir_contents

  unlinkSync: (path) ->
    if !fs_state.rm(path)
      throw "Could not unlink '#{path}'"

# Node's Path API
root.path =
  normalize: (path) -> path
  resolve: (path) -> fs_state.resolve(path)

root.process =
  cwd: -> fs_state.pwd
  chdir: (dir) ->
    absdir = fs_state.chdir dir
    throw "Invalid directory" unless absdir?
    absdir

win.require = (path) ->
  [name, ext] = (basename path).split '.'
  window[name] ?= {}

basename = (path) -> _.last path.split '/'
