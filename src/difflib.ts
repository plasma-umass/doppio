/***
This is modified from part of jsdifflib v1.0. <http://snowtide.com/jsdifflib>

Copyright (c) 2007, Snowtide Informatics Systems, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

	* Redistributions of source code must retain the above copyright notice, this
		list of conditions and the following disclaimer.
	* Redistributions in binary form must reproduce the above copyright notice,
		this list of conditions and the following disclaimer in the documentation
		and/or other materials provided with the distribution.
	* Neither the name of the Snowtide Informatics Systems nor the names of its
		contributors may be used to endorse or promote products derived from this
		software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.
***/
/* Original author: Chas Emerick <cemerick@snowtide.com> */
export function text_diff(a_lines: string[], b_lines: string[], context: number): string[] {
	return (new SequenceMatcher(a_lines, b_lines)).text_diff(context);
}

// comparison function for sorting lists of numeric tuples
function __ntuplecomp(a: number[], b: number[]) {
	var mlen = Math.max(a.length, b.length);
	for (var i = 0; i < mlen; i++) {
		if (a[i] < b[i]) return -1;
		if (a[i] > b[i]) return 1;
	}

	return a.length == b.length ? 0 : (a.length < b.length ? -1 : 1);
}

// replacement for python's dict.get function -- need easy default values
function __dictget(dict: any, key: any, defaultValue: any): any {
	return dict.hasOwnProperty(key) ? dict[key] : defaultValue;
}

export class SequenceMatcher {
	private a : string[];
	private b : string[];
	private matching_blocks: number[][];
	private opcodes: any[];
	private b2j: {[elt: string]: number[]};

	constructor(a: string[], b: string[]) {
		this.a = a;
		this.b = b;
		this.b2j = {};
		for (var i = 0; i < b.length; i++) {
			var elt = b[i];
			if (this.b2j.hasOwnProperty(elt)) {
				this.b2j[elt].push(i);
			} else {
				this.b2j[elt] = [i];
			}
		}
	}

	private find_longest_match(alo: number, ahi: number,
		                       blo: number, bhi: number): [number,number,number] {
		var a = this.a;
		var b = this.b;
		var b2j = this.b2j;
		var besti = alo;
		var bestj = blo;
		var bestsize = 0;

		var j2len = {};
		for (var i = alo; i < ahi; i++) {
			var newj2len: any = {};
			var jdict = __dictget(b2j, a[i], []);
			for (var jkey in jdict) {
				if (jdict.hasOwnProperty(jkey)) {
					var j = jdict[jkey];
					if (j < blo) continue;
					if (j >= bhi) break;
					var k = __dictget(j2len, j - 1, 0) + 1
					newj2len[j] = k;
					if (k > bestsize) {
						besti = i - k + 1;
						bestj = j - k + 1;
						bestsize = k;
					}
				}
			}
			j2len = newj2len;
		}

		while (besti > alo && bestj > blo && a[besti - 1] == b[bestj - 1]) {
			besti--;
			bestj--;
			bestsize++;
		}

		while (besti + bestsize < ahi && bestj + bestsize < bhi &&
				a[besti + bestsize] == b[bestj + bestsize]) {
			bestsize++;
		}

		return [besti, bestj, bestsize];
	}

	private get_matching_blocks(): number[][] {
		if (this.matching_blocks != null) return this.matching_blocks;
		var la = this.a.length;
		var lb = this.b.length;

		var queue = [[0, la, 0, lb]];
		var matching_blocks: Array<[number,number,number]> = [];
		while (queue.length) {
			var qi = queue.pop();
			var alo = qi[0];
			var ahi = qi[1];
			var blo = qi[2];
			var bhi = qi[3];
			var x = this.find_longest_match(alo, ahi, blo, bhi);
			var i = x[0];
			var j = x[1];
			var k = x[2];

			if (k) {
				matching_blocks.push(x);
				if (alo < i && blo < j)
					queue.push([alo, i, blo, j]);
				if (i+k < ahi && j+k < bhi)
					queue.push([i + k, ahi, j + k, bhi]);
			}
		}

		matching_blocks.sort(__ntuplecomp);

		var i1 = 0,
		    j1 = 0,
		    k1 = 0;
		var non_adjacent: Array<[number,number,number]> = [];
		for (var idx=0; idx < matching_blocks.length; idx++) {
			var block = matching_blocks[idx];
			var i2 = block[0];
			var j2 = block[1];
			var k2 = block[2];
			if (i1 + k1 == i2 && j1 + k1 == j2) {
				k1 += k2;
			} else {
				if (k1) non_adjacent.push([i1, j1, k1]);
				i1 = i2;
				j1 = j2;
				k1 = k2;
			}
		}

		if (k1) non_adjacent.push([i1, j1, k1]);

		non_adjacent.push([la, lb, 0]);
		this.matching_blocks = non_adjacent;
		return this.matching_blocks;
	}

	private get_opcodes(): any[] {
		if (this.opcodes != null) return this.opcodes;
		var i = 0;
		var j = 0;
		var answer: any[] = [];
		this.opcodes = answer;
		var blocks = this.get_matching_blocks();
		for (var idx=0; idx < blocks.length; idx++) {
			var block = blocks[idx];
			var ai = block[0];
			var bj = block[1];
			var size = block[2];
			var tag = '';
			if (i < ai && j < bj) {
				tag = 'replace';
			} else if (i < ai) {
				tag = 'delete';
			} else if (j < bj) {
				tag = 'insert';
			}
			if (tag) answer.push([tag, i, ai, j, bj]);
			i = ai + size;
			j = bj + size;

			if (size) answer.push(['equal', ai, i, bj, j]);
		}
		return answer;
	}

	public text_diff(context: number): string[] {
		var opcodes = this.get_opcodes();
		var diff: string[] = [];
		var a_side: string[] = [];
		var b_side: string[] = [];
		var a_max_len = 0;
		var last_seen = -1;
		for (var op_idx=0; op_idx<opcodes.length; op_idx++) {
			var op = opcodes[op_idx];
			if (op[0] === 'equal') continue;
			var ai = op[1];
			var bi = op[3];
			var aj = op[2]-1;
			var bj = op[4]-1;
			var start = Math.min(ai,bi);
			var end = Math.max(aj,bj);
			var c = '';
			switch (op[0]) {
			case 'delete': c = ' < '; break;
			case 'insert': c = ' > '; break;
			case 'replace': c = ' | '; break;
			}
			for (var i=Math.max(last_seen+1,start-context); i<start; i++) {
				var prefix = i + ': ';
				if (i < this.a.length) {
					a_side.push(prefix + this.a[i]);
					a_max_len = Math.max(a_max_len, this.a[i].length + prefix.length);
				} else {
					a_side.push(prefix);
				}
				if (i < this.b.length) {
					b_side.push(this.b[i]);
				} else {
					b_side.push('');
				}
				diff.push('   ');
			}
			for (var i=start; i<=end; i++) {
				var prefix = i + ': ';
				if (i >= ai && i <= aj) {
					a_side.push(prefix + this.a[i]);
					a_max_len = Math.max(a_max_len, this.a[i].length + prefix.length);
				} else {
					a_side.push(prefix);
				}
				if (i >= bi && i <= bj) {
					b_side.push(this.b[i]);
				} else {
					b_side.push('');
				}
				diff.push(c);
			}
			last_seen = end;
		}
		for (var i=0; i<diff.length; i++) {
			var a = a_side[i];
			var b = b_side[i];
			if (a.length < a_max_len)
				a += (new Array(a_max_len - a.length + 1)).join(' ');
			diff[i] = a + diff[i] + b;
		}
		return diff;
	}
}
