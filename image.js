import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let wasm;
let promise;

const callback = input => {
	var msg = msgpack.encode(input);
	const top = wasm.instance.exports.stackSave();
	const offset = wasm.instance.exports.stackAlloc(msg.length);
	new Uint8Array(wasm.instance.exports.memory.buffer, offset, msg.length).set(msg)
	var result = new Uint32Array(wasm.instance.exports.memory.buffer, wasm.instance.exports.callback(offset, msg.length), 2);
	wasm.instance.exports.stackRestore(top);
	return msgpack.decode(wasm.instance.exports.memory.buffer.slice(result[0], result[0] + result[1]));
}

const get = (ptr, len) => {
	var msg = msgpack.decode(wasm.instance.exports.memory.buffer.slice(ptr, ptr + len));
	promise = httpget(msg).then(value => callback(value));
}

const file = fs.readFileSync('./image.wasm');
wasm = await WebAssembly.instantiate(file, { "env": { "get": get } });

export async function call(input) {
	input ||= {};
	input.spec ||= {}; 
	input.spec.image ||= "apps/demo"; 
	var msg = msgpack.encode(input);
	const top = wasm.instance.exports.stackSave();
	const offset = wasm.instance.exports.stackAlloc(msg.length);
	new Uint8Array(wasm.instance.exports.memory.buffer, offset, msg.length).set(msg)
	wasm.instance.exports.call(offset, msg.length);
	wasm.instance.exports.stackRestore(top);
	return promise;
};

export { wasm };