/**
 * Top-level doppio interface. Exposed through the `DoppioJVM` global.
 */
import * as Testing from './testing';
import * as Socket from './socket';
import Heap from './heap';
import * as VM from './VM';
import * as Debug from './Debug';

export {Testing, VM, Heap, Debug, Socket};
