/**
 * Prints a DOT file to stdout containing the thread transition graph.
 */
import {validTransitions} from '../src/threading';
import {ThreadStatus} from '../src/enums';
var statuses = Object.keys(validTransitions);


process.stdout.write('digraph thread_transition_graph {\n');
// Emit nodes first.
statuses.forEach((status: string) => {
  process.stdout.write('\t' + (<any> ThreadStatus)[status] + ' [label="' + (<any> ThreadStatus)[status] + '"];\n');
});

// Emit edges.
statuses.forEach((oldStatus: string) => {
  Object.keys((<any> validTransitions)[oldStatus]).forEach((newStatus: string) => {
    process.stdout.write('\t' + (<any> ThreadStatus)[oldStatus] + ' -> ' +
      (<any> ThreadStatus)[newStatus] + ' [label="' +
      (<any> validTransitions)[oldStatus][newStatus] + '"];\n');
  });
});

// End graph.
process.stdout.write('}\n');
