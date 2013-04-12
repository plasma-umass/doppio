file = if location.search == '' then '../core-main.json' else location.search[1..]

object_refs = {}
stack_objects = []
all_objects = []

# Generates a map of ref -> obj
graph2map = (to_visit) ->
  rv = {}
  while to_visit.length > 0
    visiting = to_visit
    to_visit = []
    for obj in visiting
      rv[obj.ref] = obj
      for k,v of obj
        if k in ['fields','loaded']
          to_visit.push field_obj for field_name,field_obj of v when field_obj?.ref?
        else if k is 'array'
          to_visit.push array_obj for array_obj in v when array_obj?.ref?
  rv

record_object = (obj) ->
  return unless obj?.ref?
  if obj.ref not of object_refs
    object_refs[obj.ref] = true
    stack_objects.push obj # retain order

print_value = (obj) ->
  if obj?.ref?
    "<a class='ref' href='##{obj.ref}'>*#{obj.ref}</a>"
  else if typeof obj is 'string' and /<\*(?:\d+|bootstrapLoader)>/.test obj
    ref = obj[2...-1]
    "<a class='ref' href='##{ref}'>*#{ref}</a>"
  else
    obj + "" # ensure 'null' is visible

print_object = (obj, div, depth=1) ->
  return if depth is -1 or not obj?.ref?
  div.append ul = $('<ul>', id:"object-#{obj.ref}")
  for k,v of obj
    if k in ['fields', 'loaded']
      ul.append li = $('<li>', html: "#{k}: ")
      li.append nested = $('<ul>', class: 'fields')
      for field_name,field_obj of v
        nested.append $('<li>', html: "#{field_name}: #{print_value field_obj}")
        print_object field_obj, div, depth - 1
    else if k is 'array'
      ul.append li = $('<li>', html: "#{k}: ")
      if obj.type is '[C' or obj.type is '[B'
        li.append "\"#{(String.fromCharCode(c) for c in v).join ''}\""
      else
        li.append '['
        for array_obj in v
          li.append $('<span>', class: 'array-entry', html: print_value array_obj)
          print_object field_obj, div, depth - 1
        li.append ']'
    else
      ul.append $('<li>', html: "#{k}: #{v}")

# setup
$.get file, ((data) ->
  main = $('#main')
  frames_div = $('<div>', id: 'frames')
  for frame in data
    frames_div.prepend ul = $('<ul>')
    for k,v of frame
      if k in ['stack','locals']
        ul.append li = $('<li>', html: "#{k}: ")
        for obj in v
          record_object obj
          li.append $('<span>', class: 'array-entry', html: print_value obj)
      else if k is 'loader'
        record_object v
        ul.append $('<li>', html: "#{k}: #{print_value v}")
      else if k is 'name'
        # insert spaces so that the method signature gets wrapped
        ul.append $('<li>', html: "#{k}: #{v.replace(/;\)?(?!:)/g, '$& ')}")
      else
        ul.append $('<li>', html: "#{k}: #{v}")
  frames_div.prepend $('<h1>', html: 'Stack Frames')
  main.append frames_div

  all_objects = graph2map stack_objects

  objects_div = $('<div>', id: 'stack-objects')
  print_object obj, objects_div for obj in stack_objects
  objects_div.prepend $('<h1>', html: 'Objects')
  main.append objects_div
  gotoHash()), 'json'

gotoHash = ->
  ref = location.hash[1..] # strip the leading '#'
  if ref is ''
    objects_div = $('#stack-objects')
    objects_div.html ''
    print_object obj, objects_div for obj in stack_objects
    objects_div.prepend $('<h1>', html: 'Objects')
    return
  object_div = $("#object-#{ref}")
  unless object_div[0]?
    objects_div = $('#stack-objects')
    objects_div.html '<h1>Objects</h1>'
    print_object all_objects[ref], objects_div
    object_div = $("#object-#{ref}")
  object_div[0].scrollIntoView(true)
  object_div.css 'backgroundColor', '#ffc'
  setTimeout (-> object_div.css 'backgroundColor', ''), 400

window.addEventListener 'hashchange', gotoHash
