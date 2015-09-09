/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/async/async.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/esprima/esprima.d.ts" />
import os = require('os');
import fs = require('fs');
import path = require('path');
import async = require('async');
import esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');


function iceCream(grunt: IGrunt) {
  grunt.registerMultiTask('ice-cream', 'Removes debug statements from code.', function() {
    var iceCreamPath: string = 'node_modules/ice-cream/dessert.js',
        files: {src: string[]; dest: string}[] = this.files,
        remove: string[] = this.options().remove;
    
    files.forEach((file: {src: string[]; dest: string}) => {
      var ast = esprima.parse(fs.readFileSync(file.src[0]).toString());
      // Ensure destination folder exists
      if (!fs.existsSync(path.dirname(file.dest))) {
        grunt.file.mkdir(path.dirname(file.dest));
      }
      fs.writeFileSync(file.dest, escodegen.generate(estraverse.replace(ast, {
        enter: function(node: any) {
            if (node.type === 'ExpressionStatement' &&
                node.expression.type === 'CallExpression' &&
                remove.indexOf(node.expression.callee.name) > -1) {
                return {type:'EmptyStatement'};
            }
        }
      })));
    });
  });
}

export = iceCream;
