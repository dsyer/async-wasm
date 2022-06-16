import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let promise;

const callback = input => {
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var result = new Uint32Array(memory.buffer, wasm.instance.exports.callback(offset, msg.length), 2);
	stackRestore(top);
	return msgpack.decode(memory.buffer.slice(result[0], result[0] + result[1]));
}

const get = (ptr, len) => {
	var msg = msgpack.decode(memory.buffer.slice(ptr, ptr + len));
	promise = httpget(msg).then(value => callback(value));
}

const file = fs.readFileSync('./image.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get } });
let { stackSave, stackAlloc, stackRestore, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= {};
	input.spec ||= {}; 
	input.spec.image ||= "apps/demo"; 
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	wasm.instance.exports.call(offset, msg.length);
	stackRestore(top);
	return promise;
};

export { wasm };