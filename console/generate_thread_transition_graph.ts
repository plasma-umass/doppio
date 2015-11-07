/**
 * Prints a DOT file to stdout containing the thread transition graph.
 */
import threading = require('../src/threading');
import enums = require('../src/enums');
var statuses = Object.keys(threading.validTransitions);

process.stdout.write('digraph thread_transition_graph {\n');
// Emit nodes first.
statuses.forEach((status: string) => {
  process.stdout.write('\t' + (<any> enums.ThreadStatus)[status] + ' [label="' + (<any> enums.ThreadStatus)[status] + '"];\n');
});

// Emit edges.
statuses.forEach((oldStatus: string) => {
  Object.keys((<any> threading.validTransitions)[oldStatus]).forEach((newStatus: string) => {
    process.stdout.write('\t' + (<any> enums.ThreadStatus)[oldStatus] + ' -> ' +
      (<any> enums.ThreadStatus)[newStatus] + ' [label="' +
      (<any> threading.validTransitions)[oldStatus][newStatus] + '"];\n');
  });
});

// End graph.
process.stdout.write('}\n');
