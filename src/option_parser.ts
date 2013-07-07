/// <reference path="../vendor/node.d.ts" />
"use strict";
var underscore = require('../vendor/_.js');
var options = null;
var description = null;

export function describe(new_description: any): void {
  options = {};
  description = new_description;
  for (var k in description) {
    var category = description[k];
    var category_copy = {};
    for (var opt_name in category) {
      if (underscore.isString(opt_value)) {
        // kind of a hack, to allow for shorthand when we don't need to specify
        // the other options
        category[opt_name].description = opt_value;
      }
      var opt_value = category[opt_name];
      category_copy[opt_name] = opt_value;
      if (opt_value.alias != null) {
        opt_value.aliased_by = opt_name;
        category_copy[opt_value.alias] = opt_value;
      }
    }
    options[k] = category_copy;
  }
}

function parse_flag(args: string[], full_key: string, key: string, option_data: any, result_dict: any): string[] {
  if (!option_data[key]) {
    console.error("Unrecognized option '" + full_key + "'");
    process.exit(1);
  }
  var alias = option_data[key].aliased_by || key;
  result_dict[alias] = option_data[key].has_value ? args.pop() : 'true';
  return args;
}

export function parse(argv: string[]): any {
  var args = argv.slice(2).reverse();
  var result = {
    standard: {},
    non_standard: {},
    properties: {},
    _: []
  };

  while (args.length > 0) {
    var arg = args.pop();
    if (arg[0] !== '-' || (result.standard['jar'] != null)) {
      result._ = args.reverse();
      if (result.standard['jar'] != null) {
        result._.unshift(arg);
      } else {
        result['className'] = arg;
      }
      break;
    }
    if (arg.length <= 2) {  // for '-X', mostly
      args = parse_flag(args, arg, arg.slice(1), options.standard, result.standard);
    } else {
      switch (arg[1]) {
        case 'X':
          args = parse_flag(args, arg, arg.slice(2), options.non_standard, result.non_standard);
          break;
        case 'D':
          var property_kv = arg.slice(2).split('=');
          var key = property_kv[0];
          var value = property_kv[1] || true;
          result.properties[key] = value;
          break;
        default:
          args = parse_flag(args, arg, arg.slice(1), options.standard, result.standard);
      }
    }
  }
  return result;
};

// formatted printing helpers
function min_width(values: string[]): number {
  return Math.max.apply(values.map((v)=>v.length));
}

function print_col(value: string, width: number): string {
  var rv = value;
  var padding = width - value.length;
  while (padding-- > 0) {
    rv += ' ';
  }
  return rv;
}

function _show_help(description: any, prefix: string): string {
  var combined_keys = {};
  var key_col_width = Infinity;
  for (var key in description) {
    var opt = description[key];
    var keys = [key];
    if (opt.alias != null) {
      keys.push(opt.alias);
    }
    var ckey = keys.map((key: string) => "-" + prefix + key).join(', ');
    combined_keys[ckey] = opt;
    if (ckey.length < key_col_width) {
      key_col_width = ckey.length;
    }
  }
  var rv = '';
  for (key in combined_keys) {
    var option_desc = combined_keys[key].description;
    rv += print_col(key, key_col_width) + "    " + option_desc + "\n";
  }
  return rv;
}

export function show_help(): string {
  return _show_help(description.standard, '');
}

export function show_non_standard_help(): string {
  return _show_help(description.non_standard, 'X');
}
