import * as msgpack from '@msgpack/msgpack';
import { get as httpget } from 'runtime';

let promise;

const callback = (fn, input) => {
	var msg = msgpack.encode(input);
	const top = stackSave();
	const offset = stackAlloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var result = new Uint32Array(memory.buffer, wasm.instance.exports.callback(fn, offset, msg.length), 2);
	stackRestore(top);
	return msgpack.decode(memory.buffer.slice(result[0], result[0] + result[1]));
}

const get = (fn, ptr, len) => {
	var msg = msgpack.decode(memory.buffer.slice(ptr, ptr + len));
	promise = httpget(msg).then( response => {
		if (response.status == 401) {
			var auth = response.headers['www-authenticate'];
			if (auth && auth.startsWith("Bearer ")) {
				const fields = JSON.parse('{"' + auth.replace("Bearer ", "").replaceAll(',',',"').replaceAll('=','":') + '}');
				const headers = msg.headers || {};
				const url = fields.realm+"?service="+fields.service+"&scope="+fields.scope;
				return httpget({url: url, headers: headers}).then(
					value => {
						var token = JSON.parse(value.data).token;
						headers['Authorization'] = "Bearer " + token;
						return httpget({url: msg.url, headers: headers });
					}
				);
			}
		} else {
			return response;
		}
	}).then(value => callback(fn, value));
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
	wasm.instance.exports.call(offset, msg.length);
	stackRestore(top);
	return promise;
};

export { wasm };