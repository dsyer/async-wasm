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
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	const args = stackAlloc(16);
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
	stackRestore(top);
	return value;
}

const get = (output, fn, offset) => {
	var input = extract(offset);
	new Uint32Array(memory.buffer, output, 4).set([0, 0, fn, input.context]);
	promises[output] = httpget(input.value).then(value => callback(output, fn, value, input.context));
}

const file = fs.readFileSync('./image.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback } });
let { stackSave, stackAlloc, stackRestore, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= {};
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var output = stackAlloc(12);
	wasm.instance.exports.call(output, offset, msg.length);
	stackRestore(top);
	return output && promises[output] || {};
};

export { wasm };