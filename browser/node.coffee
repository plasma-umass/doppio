root = @node = {}

win = window

# made global for convenience -- name collision is unlikely
class win.DoppioFile # File is a native browser thing
  constructor: (@name) ->
    @mtime = (new Date).getTime()
    @data = ""

  @load: (fname) ->
    rawData = localStorage["file::#{fname?.toLowerCase()}"]
    return null unless rawData
    data = JSON.parse rawData
    file = new win.DoppioFile fname
    file[k] = v for k, v of data 
    file

  read: (length, pos) ->
    return @data unless length?
    rv = @data.substr(pos, length)
    rv

  write: (newData) -> @data += newData; @

  save: ->
    localStorage["file::#{@name.toLowerCase()}"] = JSON.stringify
      name: @name
      data: @data
      mtime: @mtime
    @

  @delete: (fname) -> localStorage.removeItem "file::#{fname.toLowerCase()}"

# this is a global in Node.JS as well
class win.Buffer
  constructor: (@array) ->

  getByteAt: (i) -> util.int2uint @array[i], 1

class Stat
  @fromPath: (path) -> new Stat win.DoppioFile.load path

  constructor: (@file) ->
    @size = @file.data.length
    @mtime = @file.mtime

  isFile: -> true # currently we only support files

  isDirectory: -> false

root.fs =
  statSync: (fname) -> Stat.fromPath fname

  fstatSync: (fp) -> new Stat(fp)

  openSync: (fname, mode) ->
    if 'r' in mode
      f = win.DoppioFile.load fname
      unless f?
        err = new Error
        err.code = 'ENOENT'
        throw err
      f
    else # XXX assuming write
      new DoppioFile fname

  readSync: (file, length, pos, encoding) ->
    data = file.read(length, pos)
    [data, data.length]

  writeSync: (file, buffer, offset, len) ->
    # TODO flush occasionally?
    file.write((String.fromCharCode(buffer.getByteAt i) for i in [offset...offset+len]).join '')

  closeSync: (file) -> file.save()

root.path =
  normalize: (path) -> path

  resolve: (path) -> path
