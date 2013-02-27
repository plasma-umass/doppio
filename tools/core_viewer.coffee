file = if location.search == '' then '../core-main.json' else location.search[1..]

object_refs = {}
objects = []

print_object = (obj) ->
  if obj?.ref?
    if obj.ref not of object_refs
      object_refs[obj.ref] = true
      objects.push obj # retain order
    "<a class='ref' href='#'>*#{obj.ref}</a>"
  else if typeof obj is 'string' and /<\*(?:\d+|bootstrapLoader)>/.test obj
    "<a class='ref' href='#'>#{obj[1...-1]}</a>"
  else
    obj + "" # ensure 'null' is visible

$.get file, ((data) ->
  main = $('#main')
  frames_div = $('<div>', id: 'frames')
  for frame in data
    frames_div.prepend ul = $('<ul>')
    for k,v of frame
      if k in ['stack','locals']
        ul.append li = $('<li>', html: "#{k}: ")
        li.append $('<span>', class: 'array-entry', html: print_object obj) for obj in v
      else if k is 'loader'
        ul.append $('<li>', html: "#{k}: #{print_object v}")
      else
        ul.append $('<li>', html: "#{k}: #{v}")
  frames_div.prepend $('<h1>', html: 'Stack Frames')
  main.append frames_div

  objects_div = $('<div>', id: 'objects')
  while objects.length > 0
    objs = objects
    objects = []
    for obj in objs
      objects_div.prepend ul = $('<ul>', id:"object-#{obj.ref}")
      for k,v of obj
        if k in ['fields', 'loaded']
          ul.append li = $('<li>', html: "#{k}: ")
          li.append nested = $('<ul>', class: 'fields')
          for field_name,field_obj of v
            nested.append $('<li>', html: "#{field_name}: #{print_object field_obj}")
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
  objects_div.prepend $('<h1>', html: 'Objects')
  main.append objects_div), 'json'

$(document).on 'click', 'a.ref', (e) ->
  e.preventDefault()
  e.stopPropagation()
  ref = $(@).text()[1..]
  object_div = $("#object-#{ref}")
  object_div[0].scrollIntoView(true)
  object_div.css 'backgroundColor', '#ffc'
  setTimeout (-> object_div.css 'backgroundColor', ''), 300
