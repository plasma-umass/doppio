import os = require('os');
import fs = require('fs');
import path = require('path');
import esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');

function iceCream(grunt: IGrunt) {
  grunt.registerMultiTask('ice-cream', 'Removes debug statements from code.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        remove: string[] = this.options().remove;

    files.forEach((file: {src: string[]; dest: string}) => {
      var jsFileContent = fs.readFileSync(file.src[0]).toString(),
        ast = esprima.parse(jsFileContent, {loc: true, range: true});
      // Ensure destination folder exists
      if (!fs.existsSync(path.dirname(file.dest))) {
        grunt.file.mkdir(path.dirname(file.dest));
      }
      var processedAst = estraverse.replace(ast, {
        enter: function(node: any) {
            if (node.type === 'ExpressionStatement' &&
                node.expression.type === 'CallExpression' &&
                remove.indexOf(node.expression.callee.name) > -1) {
                return {type:'EmptyStatement'};
            }
        }
      }), output = escodegen.generate(processedAst, {sourceMap: path.relative(path.dirname(file.dest), file.src[0]), sourceMapWithCode: true});

      var mapDest = file.dest + '.map';
      fs.writeFileSync(mapDest, output.map);
      fs.writeFileSync(file.dest, `${output.code}\n//# sourceMappingURL=${path.basename(file.dest)}.map`);
    });
  });
}

export = iceCream;
