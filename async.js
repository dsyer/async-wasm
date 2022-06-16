let wasm;
let promise;

const get = (input) =>  {
	promise = new Promise((resolve, reject) => {
		resolve(input);
	}).then(value => wasm.instance.exports.callback(value));
}

const file = fs.readFileSync('./async.wasm');
wasm = await WebAssembly.instantiate(file, {"env": {"get": get}});

export async function call(input) {
	wasm.instance.exports.call(input);
	return promise;
}
