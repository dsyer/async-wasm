import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let promises = {};

function extract(offset) {
	const view = new Uint32Array(memory.buffer, offset, 4);
	const ptr = view[0];
	const len = view[1];
	return {
		value: ptr ? msgpack.decode(memory.buffer.slice(ptr, ptr + len)) : {},
		callback: view[2],
		context: view[3]
	};
}

const callback = (output, fn, input, context) => {
	if (typeof input.data == "string") {
		input.data = JSON.parse(input.data);
	}
	var msg = msgpack.encode(input);
	const offset = allocate(msg.length);
	const args = allocate(16);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	new Uint32Array(memory.buffer, args, 4).set([offset, msg.length, 0, context]);
	wasm.instance.exports.callback(output, fn, args);
	var result = extract(output);
	var value;
	if (result.callback) {
		value = promises[output];
	} else {
		value = result.value;
		delete promises[output];
	}
	release(offset);
	release(args);
	return value;
}

const get = (output, fn, offset) => {
	var input = extract(offset);
	new Uint32Array(memory.buffer, output, 4).set([0, 0, fn, input.context]);
	promises[output] = httpget(input.value).then(value => callback(output, fn, value, input.context));
}

const file = fs.readFileSync('./image.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback } });
let { allocate, release, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= {};
	var msg = msgpack.encode(input);
	const offset = allocate(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var output = allocate(12);
	wasm.instance.exports.call(output, offset, msg.length);
	release(offset);
	release(output);
	return output && promises[output] || {};
};

export { wasm };