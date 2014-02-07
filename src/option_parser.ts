/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
"use strict";
/**
 * Option parser for Java-compatible flags.
 * @todo Avoid global state. Make this a class.
 */
var options : {[cat:string]:DescriptionCategory} = null;
var description : Description = null;

export interface Description {
  [category:string]: DescriptionCategory
}

export interface DescriptionCategory {
  [opt_name:string]: Option
}

export interface Option {
  description: string;
  has_value?: boolean;
  alias?: string;
  aliased_by?: string;
  default?: string;
}

export function describe(new_description: Description): void {
  options = {};
  description = new_description;
  for (var k in description) {
    var category = description[k];
    var category_copy: DescriptionCategory = {};
    for (var opt_name in category) {
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

function parse_flag(args: string[], full_key: string, key: string,
    option_data: DescriptionCategory, result_dict: any): string[] {
  if (!option_data[key]) {
    throw new Error("Unrecognized option '" + full_key + "'.\n");
  }
  var alias = option_data[key].aliased_by || key;
  result_dict[alias] = option_data[key].has_value ? args.pop() : 'true';
  return args;
}

export function parse(argv: string[]): any {
  var result = {
    standard: {},
    non_standard: {},
    properties: {},
    _: <string[]> []
  };
  var args = argv.reverse();

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
      args = parse_flag(args, arg, arg.slice(1), options['standard'], result.standard);
    } else {
      switch (arg[1]) {
        case 'X':
          args = parse_flag(args, arg, arg.slice(2), options['non_standard'], result.non_standard);
          break;
        case 'D':
          var property_kv = arg.slice(2).split('=');
          var key = property_kv[0];
          var value = property_kv[1] || true;
          result.properties[key] = value;
          break;
        default:
          args = parse_flag(args, arg, arg.slice(1), options['standard'], result.standard);
      }
    }
  }

  // process default values
  for (var _category in options) {
    if (!options.hasOwnProperty(_category)) {
      continue;
    }
    if (!result.hasOwnProperty(_category)) {
      result[_category] = {};
    }
    for (var _key in options[_category]) {
      if (options[_category].hasOwnProperty(_key) &&
          options[_category][_key].hasOwnProperty('default') &&
          !result[_category].hasOwnProperty(_key)) {
        result[_category][_key] = options[_category][_key].default;
      }
    }
  }

  return result;
}

function print_col(value: string, width: number): string {
  var rv = value;
  var padding = width - value.length;
  while (padding-- > 0) {
    rv += ' ';
  }
  return rv;
}

function _show_help(category: DescriptionCategory, prefix: string): string {
  var combined_keys : {[k:string]:Option} = {};
  var key_col_width = 0;
  for (var key in category) {
    var opt = category[key];
    var keys = [key];
    if (opt.alias != null) {
      keys.push(opt.alias);
    }
    var ckey = keys.map((key: string) => "-" + prefix + key).join(', ');
    combined_keys[ckey] = opt;
    if (ckey.length > key_col_width) {
      key_col_width = ckey.length;
    }
  }
  var rv = '';
  for (key in combined_keys) {
    var option_desc = combined_keys[key].description;
    rv += "    " + print_col(key, key_col_width) + "    " + option_desc + "\n";
  }
  return rv;
}

export function show_help(): string {
  return _show_help(description['standard'], '');
}

export function show_non_standard_help(): string {
  return _show_help(description['non_standard'], 'X');
}
