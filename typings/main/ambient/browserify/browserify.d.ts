// Compiled using typings@0.6.8
// Source: https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/3191f6e0088eee07c4d8fd24e4d27a40a60d9eb9/browserify/browserify.d.ts
// Type definitions for Browserify
// Project: http://browserify.org/
// Definitions by: Andrew Gaspar <https://github.com/AndrewGaspar/>
// Definitions: https://github.com/borisyankov/DefinitelyTyped


interface BrowserifyObject extends NodeJS.EventEmitter {
  add(file:string, opts?:any): BrowserifyObject;
  require(file:string, opts?:{
    expose: string;
  }): BrowserifyObject;
  bundle(opts?:{
    insertGlobals?: boolean;
    detectGlobals?: boolean;
    debug?: boolean;
    standalone?: string;
    insertGlobalVars?: any;
  }, cb?:(err:any, src:any) => void): NodeJS.ReadableStream;

  external(file:string, opts?:any): BrowserifyObject;
  ignore(file:string, opts?:any): BrowserifyObject;
  transform(tr:string, opts?:any): BrowserifyObject;
  transform(tr:Function, opts?:any): BrowserifyObject;
  plugin(plugin:string, opts?:any): BrowserifyObject;
  plugin(plugin:Function, opts?:any): BrowserifyObject;
}

interface Browserify {
  (): BrowserifyObject;
  (files:string[]): BrowserifyObject;
  (opts:{
    entries?: string[];
    noParse?: string[];
  }): BrowserifyObject;
}

declare module "browserify" {
  var browserify: Browserify;
  export = browserify;
}