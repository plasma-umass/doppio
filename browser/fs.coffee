root = this

class root.DoppioFile # File is a native browser thing
  constructor: (@name) ->
    @mtime = (new Date).getTime()

  @load: (fname) ->
    raw_data = localStorage["file::#{fname?.toLowerCase()}"]
    return null unless raw_data
    data = JSON.parse raw_data
    file = new root.DoppioFile fname
    file[k] = v for k, v of data 
    file

  read: -> @data

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
    @file = root.DoppioFile.load fname
    @mtime = file.mtime

  isFile: -> true # currently we only support files

  isDirectory: -> false

root.fs =
  statSync: (fname) -> new Stat(fname)

  openSync: (fname) -> root.DoppioFile.load fname

  readSync: (file, length) ->
    data = root.DoppioFile.read()[0...length]
    [data, data.length]
