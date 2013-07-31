#! /usr/bin/env coffee

_ = require '../vendor/underscore/underscore.js'
root = exports ? this.option_parser = {}

options = null
description = null

root.describe = (new_description) ->
  options = {}
  description = new_description
  for k, category of description
    category_copy = {}
    for opt_name, opt_value of category
      if _.isString opt_value
        # kind of a hack, to allow for shorthand when we don't need to specify
        # the other options
        opt_value = category[opt_name] = { description: opt_value }
      category_copy[opt_name] = opt_value
      if opt_value.alias?
        opt_value.aliased_by = opt_name
        category_copy[opt_value.alias] = opt_value
    options[k] = category_copy
  return

root.parse = (argv) ->
  args = argv[2..].reverse()

  result =
    standard: {}
    non_standard: {}
    properties: {}
    _: []

  parse_flag = (args, full_key, key, option_data, result_dict) ->
    unless option_data[key]
      console.error "Unrecognized option '#{full_key}'"
      process.exit 1
    result_dict[option_data[key].aliased_by ? key] =
      if option_data[key].has_value
        args.pop()
      else
        true
    args

  while args.length > 0
    arg = args.pop()
    if arg[0] isnt '-' or result.standard.jar?
      result._ = args.reverse()
      if result.standard.jar?
        result._.unshift arg
      else
        result.className = arg
      break

    if arg.length <= 2 # for '-X', mostly
      args = parse_flag args, arg, arg[1..], options.standard, result.standard
    else
      switch arg[1]
        when 'X'
          args = parse_flag args, arg, arg[2..], options.non_standard, result.non_standard
        when 'D'
          prop = arg[2..]
          [key, value] = prop.split '='
          result.properties[key] = value ? true
        else
          args = parse_flag args, arg, arg[1..], options.standard, result.standard

  result

# formatted printing helpers
min_width = (values) -> Math.max.apply(Math, value.length for value in values)

print_col = (value, width) ->
  rv = value
  padding = width - value.length
  rv += " " while padding-- > 0
  rv

show_help = (description, prefix) ->
  rv = ""
  combined_keys = {}
  for key, opt of description
    keys = [key]
    keys.push opt.alias if opt.alias?
    combined_keys[("-#{prefix}#{key}" for key in keys).join ', '] = opt
  key_col_width = min_width(key for key, opt of combined_keys)
  for key, option of combined_keys
    rv += "#{print_col key, key_col_width}    #{option.description}\n"
  rv

root.show_help = -> show_help description.standard, ''

root.show_non_standard_help = -> show_help description.non_standard, 'X'
