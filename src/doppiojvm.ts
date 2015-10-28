/**
 * Top-level doppio interface. Exposed through the `DoppioJVM` global.
 */
import * as Testing from './testing';
import Heap = require('./heap');
import * as VM from './VM';
import * as Debug from './Debug';

export {Testing, VM, Heap, Debug};
