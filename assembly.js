const callback = (output, fn, input) => {
	wasm.instance.exports.callback(output, fn, input);
}

const get = (output, fn, input) => {
	callback(output, fn, input);
}

const file = fs.readFileSync('./build/debug.wasm');
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback, "console.log": console.log, "abort": () => {console.log("Aborted")} } });
let { malloc, free, memory } = wasm.instance.exports;

export async function call(value) {
	value ||= 0;
	const output = malloc(8);
	wasm.instance.exports.call(output, value, 123);
	var result = new Uint32Array(memory.buffer, output, 2).slice(0);
	free(output);
	return result;
};

export { wasm };