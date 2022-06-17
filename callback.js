let promise;

const callback = (fn, input) => {
	return wasm.instance.exports.callback(fn, input);
}

const get = (fn, input) => {
	promise = new Promise( (resolve, error) => {
		resolve(input);
	}).then(value => callback(fn, value));
}

const file = fs.readFileSync('./callback.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback } });
let { stackSave, stackAlloc, stackRestore, memory } = wasm.instance.exports;

export async function call(input) {
	input ||= 0;
	wasm.instance.exports.call(input);
	return promise;
};

export { wasm };