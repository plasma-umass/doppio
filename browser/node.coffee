win = window

root = win.node = {}

# made global for convenience -- name collision is unlikely
class win.DoppioFile # File is a native browser thing
  constructor: (@name) ->
    @mtime = (new Date).getTime()
    @data = ""

  @load: (fname) ->
    fname = basename root.path.resolve fname
    rawData = localStorage["file::#{fname?.toLowerCase()}"]
    return null unless rawData
    data = JSON.parse rawData
    file = new win.DoppioFile fname
    file[k] = v for k, v of data
    file

  read: (length, pos) ->
    return @data unless length?
    @data.substr(pos, length)

  write: (newData) -> @data += newData; @

  save: ->
    localStorage["file::#{@name.toLowerCase()}"] = JSON.stringify
      name: @name
      data: @data
      mtime: @mtime
    @

  @delete: (fname) ->
    fname = basename root.path.resolve fname
    localStorage.removeItem "file::#{fname.toLowerCase()}"

# this is a global in Node.JS as well
class win.Buffer
  constructor: (obj) ->
    if obj instanceof Array
      @array = obj
    else # assume num
      @array = new Array obj

  readUInt8: (i) -> util.int2uint @array[i], 1

class Stat
  @fromPath: (path) ->
    if path == ''
      stat = new Stat
      stat.size = 1
      stat.mtime = (new Date).getTime()
      stat.is_file = false
      stat.is_directory = true
      stat
    else
      file = win.DoppioFile.load path
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

root.fs =
  statSync: (fname) ->
    fname = root.path.resolve fname
    unless fname is '/System/Library/Frameworks/JavaVM.framework/Classes/classes.jar'
      return Stat.fromPath fname
    stat = new Stat
    stat.size = 21090
    stat.mtime = (new Date).getTime() - 10000
    stat.is_file = true
    stat.is_directory = false
    stat

  fstatSync: (fp) -> new Stat(fp)

  openSync: (fname, mode) ->
    fname = root.path.resolve fname
    if 'r' in mode
      f = win.DoppioFile.load fname
      unless f?
        err = new Error
        err.code = 'ENOENT'
        throw err
      f
    else # XXX assuming write
      new DoppioFile fname

  readSync: (file, buf, offset, length, pos) ->
    data = file.read(length, pos)
    for d, i in data
      buf.array[offset+i] = data.charCodeAt(i) & 0xFF
    data.length

  writeSync: (file, buffer, offset, len) ->
    # TODO flush occasionally?
    file.write(String.fromCharCode(buffer.readUInt8(i) for i in [offset...offset+len] by 1).join '')

  closeSync: (file) -> file.save()

  readdirSync: (path) ->
    for key, file of localStorage when key[..5] == 'file::'
      DoppioFile.load(key[6..]).name

root.path =
  normalize: (path) -> path

  resolve: (path) ->
    absolute = path[0] == '/'
    components = path.split '/'
    for c, idx in components
      components[idx] = '' if c == '.'
    # remove repeated //s
    path = (c for c, idx in components when c != '').join '/'
    (if absolute then '/' else '') + path

win.require = (path) ->
  [name, ext] = (basename path).split '.'
  window[name] ?= {}

basename = (path) -> _.last path.split '/'
