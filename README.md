The Rust tooling has extensive support for async functions in WASM using the `wasm-bindgen` crate. It generates a *lot* of JavaScript which makes it mostly unsuitable for polyglot scenarios since you can only run WASM binaries that are generated with those bindings. Instead, we can pick apart what is going on in the `bindgen` code and try and simplify it.

Suppose we want to export a function "call" from a WASM that calls out to an imported "get". The simplest possible implementation is just a delegation:

```wasm
(module
  (type $0 (func))
  (import "env" "get" (func $get (type $0)))
  (func $call (type $0)
    call $get
  )
  (export "call" (func $call))
)
```

Now imagine if the "get" function wants to be asynchronous, so in JavaScript it returns a `Promise`. Well it can't because there is no sane representation of a promise in WASM. But it can manipulate global (or module-scoped) state, so you can stash the promise in a global variable:

```javascript
let promise;
const get = () =>  {
	promise = new Promise((resolve, reject) => {
		resolve(
			// Do whatever you need to produce a result, e.g.
			123
		);
	});
}

wasm = await WebAssembly.instantiate(file, {"env": {"get": get}});
```

and then export a wrapper for the WASM "call" which returns the global:

```javascript
export async function call() {
	wasm.instance.exports.call();
	return promise;
}
```

This will then work:

```javascript
$ wat2wasm async.wat > async.wasm
$ node
> var as = await import("./async.mjs")
> await as.call()
123
```

but it's not very interesting because the result of the promise is never handed back to the WASM for processing. To make it more useful we need the WASM to be able to export a callback that we then apply to the result of the imported "get":

```javascript
const get = () =>  {
	promise = new Promise((resolve, reject) => {
		resolve(123)
		  .then(value => wasm.instance.exports.callback(value));
	});
}
```

and we can define the callback in the WASM:

```wasm
(module
  (type $0 (func))
  (type $1 (func (param i32) (result i32)))
  ...
  (func $callback (type $1) (param $value i32) (result i32)
    local.get $value
    i32.const 321
    i32.add
  )
  (export "callback" (func $callback))
)
```

so that:

```javascript
> var as = await import("./async.js")
> await as.call()
444
```

Note that the exported and imported WASM functions that return a "promise" actually return void and the wrapper handles the promise as global state.

The `wasm-bindgen` generated code does essentially that. It looks for all the functions that return a promise, wraps them (with some mangled name), and manages the global state. To be safer and more generic the state is an array instead of a single global variable, and all the WASM functions return an integer instead of void, which is an index into the global array.

If the "call" function does something more interesting than simply delegating to "get" then the implementation of the WASM gets a bit more complicated, but only to the same extent that we expect "nested callback hell" when a language doesn't have native async constructs.