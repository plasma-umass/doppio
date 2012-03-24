root = @node = {}

win = window

class win.DoppioFile # File is a native browser thing
  constructor: (@name) ->
    @pos = 0
    @mtime = (new Date).getTime()

  @load: (fname) ->
    raw_data = localStorage["file::#{fname?.toLowerCase()}"]
    return null unless raw_data
    data = JSON.parse raw_data
    file = new win.DoppioFile fname
    file[k] = v for k, v of data 
    file

  read: (length) ->
    return @data unless length?
    rv = @data.substr(@pos, length)
    @pos += length
    rv

  write: (@data) -> @

  save: ->
    localStorage["file::#{@name.toLowerCase()}"] = JSON.stringify
      name: @name
      data: @data
      mtime: @mtime
    @

  @delete: (fname) -> localStorage.removeItem "file::#{fname.toLowerCase()}"

class Stat
  constructor: (fname) ->
    @file = win.DoppioFile.load fname
    @mtime = @file.mtime

  isFile: -> true # currently we only support files

  isDirectory: -> false

root.fs =
  statSync: (fname) -> new Stat(fname)

  openSync: (fname) -> win.DoppioFile.load fname

  readSync: (file, length) ->
    data = file.read(length)
    [data, data.length]

root.path =
  normalize: (path) -> path

  resolve: (path) -> path
