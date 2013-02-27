file = if location.search == '' then '../core-main' else location.search[1..]

object_refs = {}
objects = []

print_object = (obj) ->
  if obj?.ref?
    if obj.ref not of object_refs
      object_refs[obj.ref] = true
      objects.push obj # retain order
    "<a class='ref' href='#'>*#{obj.ref}</a>"
  else if typeof obj is 'string' and /<\*\d+>/.test obj
    "<a class='ref' href='#'>#{obj[1...-1]}</a>"
  else
    obj

$.get file, (data) ->
  data = JSON.parse data
  main = $('#main')
  frames_div = $('<div>', id: 'frames', html: '<h1>Stack Frames</h1>')
  #TODO: rewrite this when we move to coffeescript v1.5.0
  for frame_idx in [data.length-1..0] by -1
    frame = data[frame_idx]
    frames_div.append ul = $('<ul>')
    for k,v of frame
      if k in ['stack','locals']
        li = $('<li>', html: "#{k}: ")
        li.append $('<span>', class: 'array-entry', html: print_object obj) for obj in v
        ul.append li
      else
        ul.append $('<li>', html: "#{k}: #{v}")
  main.append frames_div

  objects_div = $('<div>', id: 'objects', html: '<h1>Objects</h1>')
  while objects.length > 0
    objs = objects[..]
    objects = []
    for obj in objs
      objects_div.append ul = $('<ul>', id:"object-#{obj.ref}")
      for k,v of obj
        if k is 'fields'
          ul.append li = $('<li>', html: "#{k}: ")
          li.append nested = $('<ul>', class: 'fields')
          for field_name,obj of v
            nested.append $('<li>', html: "#{field_name}: #{print_object obj}")
        else if k is 'array'
          ul.append li = $('<li>', html: "#{k}: ")
          if obj.type is '[C'
            li.append "\"#{(String.fromCharCode(c) for c in v).join ''}\""
          else
            li.append '['
            for obj in v
              li.append $('<span>', class: 'array-entry', html: print_object obj)
            li.append ']'
        else
          ul.append $('<li>', html: "#{k}: #{v}")
  main.append objects_div

$(document).on 'click', 'a.ref', (e) ->
  e.preventDefault()
  e.stopPropagation()
  ref = $(@).text()[1..]
  object_div = $("#object-#{ref}")
  object_div[0].scrollIntoView(true)
  object_div.css 'backgroundColor', '#ffc'
  setTimeout (-> object_div.css 'backgroundColor', ''), 300
