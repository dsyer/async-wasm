import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let promises = {};

const callback = (output, fn, input, context) => {
	if (typeof input.data == "string") {
		input.data = JSON.parse(input.data);
	}
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	const args = stackAlloc(4);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	new Uint32Array(memory.buffer, args, 4).set([offset, msg.length, 0, context]);
	wasm.instance.exports.callback(output, fn, args);
	var result = new Uint32Array(memory.buffer, output, 4);
	var value;
	if (result[2]) {
		value = promises[output].promise;
	} else {
		value = msgpack.decode(memory.buffer.slice(result[0], result[0] + result[1]));
		delete promises[output];
	}
	stackRestore(top);
	return value;
}

const get = (output, fn, offset) => {
	const view = new Uint32Array(memory.buffer, offset, 4);
	var input = {
		ptr: view[0],
		len: view[1],
		callback: view[2],
		context: view[3]
	};
	new Uint32Array(memory.buffer, output, 4).set([0, 0, fn, input.context]);
	var msg = msgpack.decode(memory.buffer.slice(input.ptr, input.ptr + input.len));
	promises[output] = {
		promise: httpget(msg).then(value => callback(output, fn, value, input.context)),
		callback: fn};
}

const file = fs.readFileSync('./image.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback } });
let { stackSave, stackAlloc, stackRestore, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= {};
	input.spec ||= {}; 
	input.spec.image ||= "apps/demo"; 
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var output = stackAlloc(12);
	wasm.instance.exports.call(output, offset, msg.length);
	stackRestore(top);
	return output && promises[output].promise;
};

export { wasm };