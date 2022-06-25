import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let promises = {};

function extract(offset) {
	const view = new Uint32Array(memory.buffer, offset, 6);
	const ptr = view[0];
	const len = view[1];
	return {
		value: ptr ? msgpack.decode(memory.buffer.slice(ptr, ptr + len)) : {},
		callback: view[2],
		context: {data: view[3], len: view[4]},
		index: view[5]
	};
}

const callback = (output, fn, input, context) => {
	if (typeof input.data == "string") {
		try {
			input.data = JSON.parse(input.data);
		} catch (err) {}
	}
	var msg = msgpack.encode(input);
	const offset = malloc(msg.length);
	const args = malloc(24);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	new Uint32Array(memory.buffer, args, 6).set([offset, msg.length, 0, context.data, context.len, output]);
	wasm.instance.exports.callback(output, fn, args);
	var result = extract(output);
	var value;
	if (result.callback && result.index) {
		value = promises[result.index];
	} else {
		value = result.value;
		if (result.index) { delete promises[result.index]; }
	}
	free(offset);
	free(args);
	return value;
}

const get = (output, fn, offset) => {
	var input = extract(offset);
	new Uint32Array(memory.buffer, output, 6).set([0, 0, fn, input.context.data, input.context.len, output]);
	promises[output] = httpget(input.value).then(value => callback(output, fn, value, input.context));
}

const file = fs.readFileSync('./image.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback }});
let { malloc: _malloc, free: _free } = wasm.instance.exports;
let { allocate: malloc = _malloc, release: free = _free, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= {};
	var msg = msgpack.encode(input);
	const offset = malloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var output = malloc(24);
	wasm.instance.exports.call(output, offset, msg.length);
	var result = extract(output);
	free(offset);
	free(output);
	return result.index && promises[result.index] || {};
};

export { wasm };