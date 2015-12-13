export const enum ParseType {
  // A simple flag, e.g. -help
  FLAG,
  // An option that contains a value specified with colon syntax, e.g.
  // -ea:myPkg....
  COLON_VALUE_SYNTAX,
  // An option that can specified as a flag, or with a value.
  COLON_VALUE_OR_FLAG_SYNTAX,
  // An option that contains a value specified in a normal fashion, e.g.
  // -cp .
  // These require that a value be set.
  NORMAL_VALUE_SYNTAX,
  // An option specified as a map, e.g. the option 'D': -Dkey=value
  // These can be specified multiple times.
  MAP_SYNTAX
}

export interface Description {
  [prefix: string]: DescriptionCategory
}

export interface DescriptionCategory {
  [optionName: string]: Option;
}

export interface Option {
  // Describes the option. Used for help text.
  desc?: string;
  // Describes how the option should be parsed. Defaults to 'FLAG'.
  type?: ParseType
  // For options that take an optional value, an example of the option.
  // Used for help text.
  optDesc?: string;
  // Describes a short alias for the option.
  alias?: string;
  // After parsing this option, stop parsing. The remaining arguments
  // should be passed in raw.
  stopParsing?: boolean;
  // [INTERNAL ONLY]
  prefix?: string;
  // [INTERNAL ONLY]
  name?: string;
}

export interface RawPrefixParseResult {
  [optionName: string]: boolean | string | {[name: string]: string}
}

// Usage.

export class PrefixParseResult {
  private _result: RawPrefixParseResult;
  private _unparsedArgs: string[];
  constructor(result: RawPrefixParseResult, unparsedArgs: string[] = []) {
    this._result = result;
    this._unparsedArgs = unparsedArgs;
  }

  public unparsedArgs(): string[] {
    return this._unparsedArgs;
  }

  public flag(name: string, defaultVal: boolean): boolean {
    let val = this._result[name];
    if (typeof(val) === 'boolean') {
      return <boolean> val;
    }
    return defaultVal;
  }

  public stringOption(name: string, defaultVal: string): string {
    let val = this._result[name];
    if (typeof(val) === 'string') {
      return <string> val;
    }
    return defaultVal;
  }

  public mapOption(name: string): {[name: string]: string} {
    let val = this._result[name];
    if (typeof(val) === 'object') {
      return <{[name: string]: string}> val;
    }
    return {};
  }
}

export interface ParseResult {
  [prefix: string]: PrefixParseResult;
}

function getOptName(prefix: string, name: string): string {
  return prefix !== 'default' ? `${prefix}${name}` : name
}

/**
 * Handles parsing for a specific options configuration.
 * Parses Java-style options.
 */
export class OptionParser {
  private _parseMap: {[optName: string]: Option} = {};
  private _prefixes: string[] = [];
  private _mapArgs: string[] = [];
  private _rawDesc: Description;

  constructor(desc: Description) {
    this._rawDesc = desc;
    this._prefixes = Object.keys(desc);
    this._prefixes.forEach((prefix) => {
      let opts = desc[prefix];
      let optNames = Object.keys(opts);
      optNames.slice(0).forEach((optName) => {
        let option = opts[optName];
        if (!option.type) {
          option.type = ParseType.FLAG;
        }
        if (option.type === ParseType.MAP_SYNTAX) {
          // ASSUMPTION: These do not have aliases.
          this._mapArgs.push(optName);
        }
        option.prefix = prefix;
        option.name = optName;
        this._parseMap[getOptName(prefix, optName)] = option;
        if (option.alias) {
          optNames.push(option.alias);
          this._parseMap[getOptName(prefix, option.alias)] = option;
        }
      });
    });
  }

  /**
   * Parses the given arguments. Throws an exception on parsing failure.
   */
  public parse(argv: string[]): ParseResult {
    let result: {[name: string]: RawPrefixParseResult} = {},
      ptr: number = 0,
      len: number;

    this._prefixes.forEach((prefix) => result[prefix] = {});

    argv = argv.map((arg) => arg.trim()).filter((arg) => arg !== '');
    len = argv.length;

    while (ptr < len) {
      var arg = argv[ptr];
      if (arg[0] === '-') {
        arg = arg.slice(1);
        var opt: Option;
        if (opt = this._parseMap[arg]) {
          switch (opt.type) {
            case ParseType.FLAG:
            case ParseType.COLON_VALUE_OR_FLAG_SYNTAX:
              result[opt.prefix][opt.name] = true;
              break;
            case ParseType.NORMAL_VALUE_SYNTAX:
            case ParseType.COLON_VALUE_SYNTAX:
              ptr++;
              if (ptr < len) {
                result[opt.prefix][opt.name] = argv[ptr];
              } else {
                throw new Error(`-${arg} requires an argument.`);
              }
              break;
            case ParseType.MAP_SYNTAX:
              // NOP.
              break;
            default:
              // Invalid.
              throw new Error(`INTERNAL ERROR: Invalid parse type for -${arg}.`);
          }
        } else if (this._mapArgs.filter((mapArg) => {
          if (arg.slice(0, mapArg.length) === mapArg) {
            opt = this._parseMap[mapArg];
            return true;
          }
          return false;
        }).length > 0) {
          // ASSUMPTION: Map args are mutually exclusive.
          // Argument is -{mapArg}key=value
          // If no value, set to ''.
          let mapping = arg.slice(opt.name.length),
            map = <{[name: string]: string}> result[opt.prefix][opt.name];
          if (!map) {
            map = result[opt.prefix][opt.name] = {};
          }
          let eqIdx = mapping.indexOf('=');
          if (eqIdx !== -1) {
            map[mapping.slice(0, eqIdx)] = mapping.slice(eqIdx + 1);
          } else {
            map[mapping] = "";
          }
        } else if (arg.indexOf(':') !== -1 && (opt = this._parseMap[arg.slice(0, arg.indexOf(':'))])) {
          // Colon option.
          if (opt.type === ParseType.COLON_VALUE_SYNTAX || opt.type === ParseType.COLON_VALUE_OR_FLAG_SYNTAX) {
            result[opt.prefix][opt.name] = arg.slice(arg.indexOf(':') + 1);
          } else {
            // Unrecognized option.
            throw new Error(`Unrecognized option: -${arg}`);
          }
        } else {
          throw new Error(`Unrecognized option: -${arg}`);
        }

        if (opt.stopParsing) {
          ptr++;
          break;
        }

      } else {
        break;
      }

      // Advance to next value.
      ptr++;
    }
    // ptr is at raw args to program / JVM.
    let unparsedArgs = argv.slice(ptr),
      rv: ParseResult = {};
    Object.keys(result).forEach((prefix) => {
      rv[prefix] = new PrefixParseResult(result[prefix], unparsedArgs);
    });
    return rv;
  }

  /**
   * Generates help text for the given prefixed options.
   */
  public help(prefix: string): string {
    return _showHelp(this._rawDesc[prefix], prefix === 'default' ? '' : prefix);
  }
}

function printCol(value: string, width: number): string {
  var rv = value;
  var padding = width - value.length;
  while (padding-- > 0) {
    rv += ' ';
  }
  return rv;
}

function _showHelp(category: DescriptionCategory, prefix: string): string {
  var combinedKeys : {[k:string]:Option} = {};
  var keyColWidth = 13;
  Object.keys(category).forEach((key) => {
    var opt = category[key];
    // Ignored in help text.
    if (opt.stopParsing) {
      return;
    }
    var keys = [key];
    if (opt.alias != null) {
      keys.push(opt.alias);
    }

    let ckey: string;
    if (opt.optDesc) {
      ckey = keys.map((key: string) => `-${prefix}${key}${opt.optDesc}`).join("\n");
    } else {
      ckey = keys.map((key: string) => `-${prefix}${key}`).join(' | ');
    }
    combinedKeys[ckey] = opt;
  });
  return Object.keys(combinedKeys).map((key) => {
    let option = combinedKeys[key];
    if (option.optDesc) {
      let cols = key.split('\n');
      let rv = cols.map((row) =>  `    ${row}`);
      // Multiline.
      return `${rv.join('\n')}\n                  ${option.desc}`;
    } else {
      let colText = printCol(key, keyColWidth);
      if (colText.length === keyColWidth) {
        return `    ${colText} ${option.desc}`;
      } else {
        return `    ${colText}\n                  ${option.desc}`;
      }
    }
  }).join('\n') + '\n';
}
