import * as msgpack from '@msgpack/msgpack';

let wasm;
let promise;

const callback = (input, offset) => {
	var msg = msgpack.encode(input);
	new Uint8Array(wasm.instance.exports.memory.buffer, offset, msg.length).set(msg)
	var result = new Uint32Array(wasm.instance.exports.memory.buffer, wasm.instance.exports.callback(offset, msg.length), 2);
	return msgpack.decode(wasm.instance.exports.memory.buffer.slice(result[0], result[0] + result[1]));
}

const get = (ptr, len) =>  {
	var msg = msgpack.decode(wasm.instance.exports.memory.buffer.slice(ptr, ptr + len));
	promise = new Promise((resolve, reject) => {
		resolve(msg);
	}).then(value => callback(value, ptr + len));
}

const file = fs.readFileSync('./message.wasm');
wasm = await WebAssembly.instantiate(file, {"env": {"get": get}});

export async function call(input) {
	var msg = msgpack.encode(input);
	new Uint8Array(wasm.instance.exports.memory.buffer, 1, msg.length).set(msg)
	wasm.instance.exports.call(1, msg.length);
	return promise;
};

export {wasm};