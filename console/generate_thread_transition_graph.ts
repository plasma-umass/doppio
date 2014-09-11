/**
 * Prints a DOT file to stdout containing the thread transition graph.
 */
import threading = require('../src/threading');
import enums = require('../src/enums');
var statuses = Object.keys(threading.validTransitions);

process.stdout.write('digraph thread_transition_graph {\n');
// Emit nodes first.
statuses.forEach((status: string) => {
  process.stdout.write('\t' + enums.ThreadStatus[status] + ' [label="' + enums.ThreadStatus[status] + '"];\n');
});

// Emit edges.
statuses.forEach((oldStatus: string) => {
  Object.keys(threading.validTransitions[oldStatus]).forEach((newStatus: string) => {
    process.stdout.write('\t' + enums.ThreadStatus[oldStatus] + ' -> ' +
      enums.ThreadStatus[newStatus] + ' [label="' +
      threading.validTransitions[oldStatus][newStatus] + '"];\n');
  });
});

// End graph.
process.stdout.write('}\n');
