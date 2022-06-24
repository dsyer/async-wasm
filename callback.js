let promises = {};

function convert(offset) {
	const view = new Uint32Array(memory.buffer, offset, 2);
	var result = {
		callback: view[0],
		value: view[1]
	};
	return result;
}

const callback = (output, fn, input) => {
	wasm.instance.exports.callback(output, fn, input);
	var value = convert(output);
	if (value.callback != 0) {
		value = promises[output].promise;
	} else {
		value = value.value;
		delete promises[output]
	}
	return value;
}

const get = (output, fn, input) => {
	new Uint32Array(memory.buffer, output, 2).set([fn, 0]);
	promises[output] = {
		promise: new Promise((resolve, error) => {
			resolve(input);
		}).then(value => callback(output, fn, value)),
		callback: fn
	};
}

const file = fs.readFileSync('./callback.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback } });
let { allocate, release, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= 0;
	const output = allocate(8);
	wasm.instance.exports.call(output, input);
	release(output);
	return promises[output].promise;
};

export { wasm, promises };