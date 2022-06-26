The Rust tooling has extensive support for async functions in WASM using the `wasm-bindgen` crate. It generates a *lot* of JavaScript which makes it mostly unsuitable for polyglot scenarios since you can only run WASM binaries that are generated with those bindings. Instead, we can pick apart what is going on in the `bindgen` code and try and simplify it.

## Simple Async Call Wrapper

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

## Add in MessagePack

To make the code above more generic, we could pass JSON in and out of the functions using a binary encoding like [Protobuf](https://developers.google.com/protocol-buffers) or [MessagePack](https://msgpack.org/index.html). MessagePack is easier to map to a generic object like a JSON, so let's work with that. In the runtime (currently JavaScript) layer we will need the Npm module `@msgpack/msgpack`:

```javascript
import * as msgpack from '@msgpack/msgpack';
```

and then we can write the main entry point `call()` as 

```javascript
export async function call(input) {
	var msg = msgpack.encode(input);
	new Uint8Array(wasm.instance.exports.memory.buffer, 1, msg.length).set(msg)
	wasm.instance.exports.call(1, msg.length);
	return promise;
};
```

where we have chosen (arbitrarily) to put the binary data representing the input at offset 1 in the WASM memory. If the WASM entry point needs to accept the offset and length as arguments, it has a signature of `(func $call (param $ptr i32) (param $len i32))` or (in C):

```c
void call(char *input, size_t len);
```

We'll keep the delegation pattern for now, so `call()` is implemented simply as an invocation of the imported `get()` which therefore has the same signature. In JavaScript we need to decode the data from the input pointer and use it to resolve a promise, finally passing control back to a callback:

```javascript
const get = (ptr, len) =>  {
	var msg = msgpack.decode(wasm.instance.exports.memory.buffer.slice(ptr, ptr + len));
	promise = new Promise((resolve, reject) => {
		resolve(msg);
	}).then(value => callback(value, ptr + len));
}
```

The `callback()` is a wrapper around a call into the WASM as before, but with encoding and decoding before and after:

```javascript
const callback = (input, offset) => {
	var msg = msgpack.encode(input);
	new Uint8Array(wasm.instance.exports.memory.buffer, offset, msg.length).set(msg)
	var result = new Uint32Array(wasm.instance.exports.memory.buffer, wasm.instance.exports.callback(offset, msg.length), 2);
	return msgpack.decode(wasm.instance.exports.memory.buffer.slice(result[0], result[0] + result[1]));
}
```

For safety we put the result of the callback in the WASM memory at a offset that doesn't clash with the input to `get()`.

To implement the WASM we will use C and the MessagePack library. This sample just extracts a field called "message" and copies it to the output as a field called "msg":

```c
#include "mpack.h"

void get(char *input, size_t len);

typedef struct _buffer {
    char *data;
    size_t len;
} buffer;

buffer *callback(char *input, size_t len)
{
	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input, len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);

	mpack_writer_t writer;
	buffer *result = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "msg");
	mpack_write_cstr(&writer, mpack_node_str(mpack_node_map_cstr(root, "message")));
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);

	return result;
}

void call(char *input, size_t len) {
	get(input, len);
}
```

To compile it:

```
$ curl -vL https://github.com/dsyer/mpack-wasm/releases/download/v1.1-0.0.1/mpack-wasm.tgz | tar -xzvf -
$ emcc -Os -s EXPORTED_FUNCTIONS="[_call,_callback]" -Wl,--no-entry -I include message.c lib/libmpack.a -o message.wasm
```

Putting it together we can run it in Node.js

```javascript
$ node
> var ms = await import("./message.js")
> await ms.call({message:"Hello World"})
{ msg: 'Hello World' }
```

## Virtual Functions

If we needed to call the `get()` function from the example above (for instance) more then once, and do something different with the result each time, we would need some indirection. The `get()` function can pick up an extra argument which is a pointer to the callback:

```c
void get(buffer *(*fn)(char*, size_t), char *input, size_t len);
```

All it has to do in the runtime implementation is pass that pointer down to a convenience function:

```javascript
const get = (fn, ptr, len) =>  {
	var msg = msgpack.decode(wasm.instance.exports.memory.buffer.slice(ptr, ptr + len));
	promise = new Promise((resolve, reject) => {
		resolve(msg);
	}).then(value => callback(fn, value, ptr + len));
}
```

where `callack()` is now a generic virtual dispatch:

```c
buffer *callback(buffer *(*fn)(char*, size_t), char *input, size_t len) {
	return fn(input, len);
}
```

The implementation of the main entry point `call()` now just passes the pointer to the desired callback into `get()`. The actual business logic is encapsulated in a private, not exported function named (arbitrarily in this example) `xform`:

```c
buffer *xform(char *input, size_t len)
{
	// ... compute xform
	return result;
}

void call(char *input, size_t len)
{
	// ... compute input for get() ...
	get(xform, result->data, result->len);
}
```

Compile and run:

```
$ emcc -Os -s EXPORTED_FUNCTIONS="[_call,_callback]" -Wl,--no-entry -I include message.c lib/libmpack.a -o message.wasm
$ node
> var ms = await import("./message.js")
> await ms.call({message:"Hello World"})
{ msg: 'Hello World' }
```

> NOTE: we could live without the `callback()` convenience function in the WASM because in Javascript `callback(fn, ...)` is the same as `wasm.instance.exports.__indirect_function_table.get(fn)(...)`, as long as the WASM is generated by Emscripten.

## Docker Image Processor

As a more "real" example we can try and write a Kubernetes resource transformation. The goal is to look in the input payload for `spec.image` and use that to extract a SHA256 label for the latest image in a Docker repository. The code for that is in `image.c`, where the call to the repository is through an external "get" function, which has to be imported into the WASM. The JavaScript implementation uses the `http` module in Node.js via a local library called "runtime".

Compile the WASM:

```
$ emcc -Os -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s EXPORTED_FUNCTIONS="[_call,_callback]" -Wl,--no-entry -I include image.c lib/libmpack.a -o image.wasm
```

Here it is in action (when there is a registry running on localhost):

```javascript
> var is = await import("./image.js")
> await is.call({spec:{image:"localhost:5000/apps/demo"}})
{
  complete: true,
  latest_image: 'sha256:95c043ec7f3c9d5688b4e834a42ad41b936559984f4630323eaf726824a803fa'
}
```

It also works with Dockerhub:

```javascript
> await is.call({spec:{image:"nginx"}})
{
  complete: true,
  latest_image: 'sha256:51f26f0b31eb2f2da7209d4c9d585570e62573a89bb1cbd2ea57858dbd117fd3'
}
```

> NOTE: the HTTP return value from the `/v2` endpoint in the registry is quite large - it has all the image metadata attached - so we can't rely on just guessing if there is enough memory available at the bottom of the buffer in the WASM. We actually need to ask it to allocate and free memory for us. We use this pattern:
>
> ```javascript
> const top = stackSave();
> const offset = stackAlloc(len);
> // ... do something with the memory
> stackRestore(top);
> ```
> 
> The stack manipulation functions come as standard with `emcc`, but using them does tie us to that toolchain, sadly.

### ABI

The Application Binary Interface (ABI) of the WASM in this example is quite simple. It consists of a data structure, and imported function, and two exports (one of which is just a convenience).

An async `get()` function is imported and implemented in JavaScript as an HTTP GET. The signature in C is:
```c
future get(future (*fn)(future *), future *input);
```

The `future` data structure holds information and context about async callbacks and their results. Here is the definition in C:
```c
typedef struct
{
    char *data;
    size_t len;
    void (*callback)(void *);
    void *context;
    size_t context_len;
    void *index;
} future;
```
A function that wants to return a concrete JSON can encode it as a MessagePack and set the `data` (plus associated `len`) and return a `future` directly. A function that wants to do something asynchronous can set use the `future` to encode the input argument, call the imported `get()` and return the result. In WASM memory the `future` is just an array of 6 `i32` (total size 24 bytes). The `index` field is used to pass a map key from the host `get()` to the host `callback()` - the guest code (WASM) doesn't need to and shouldn't use it. In contrast, the `context` pointer (and associated length) is for the guest to use as necessary, and it is the guest's responsibility to copy it across if it creates a new future instance. In the "image" sample here it is used to store the original URL for the repository metadata query, so it can be reused when the authentication is complete for a secure registry (like Dockerhub).

The `call()` function is exported and contains the main "business logic". It is declared as an asynchronous wrapper in JavaScript, allowing the WASM implementation to call out to `get()` and return the result. Its signature is :
```c
 future call(char *input, size_t len);
```
where the input (and length) are as above a MessagePack encoded JSON. In WASM terms the signature is `(func (param i32 i32 i32))`, where the first parameter is a pointer to the result, and the second and third are the MessagePack binary.

There is also an exported `callback()` convenience function (as above) which does virtual function dispatch. In C:
```c
future callback(future (*fn)(future *), future *input)
{
    return fn(input);
}
```
In WASM terms the signature is `(func (param i32 i32 i32))`, where the first parameter is a pointer to the result, the second is the virtual function index, and the third is a pointer to the input.

## Memory Management

The `stack*` functions from `emcc` don't show up in code generated other ways, so if we want to be able to use other guest languages we need a better solution for memory management. From C we can simply export `malloc` and `free` from the standard library:

```
$ emcc -Os -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s EXPORTED_FUNCTIONS="[_call,_callback, _malloc, _free]" -Wl,--no-entry -I include image.c lib/libmpack.a -o image.wasm
```

and then use it in the JavaScript. Example:

```javascript
export async function call(input) {
	input ||= {};
	var msg = msgpack.encode(input);
	const offset = malloc(msg.length);
	new Uint8Array(memory.buffer, offset, msg.length).set(msg)
	var output = malloc(24);
	wasm.instance.exports.call(output, offset, msg.length);
	var result = extract(output);
	free(offset);
	free(output);
	return result.index && promises[result.index] || {};
};
```

We can't export `malloc` and `free` from Rust, but we can provide a binary compatible equivalents:

```Rust
#[no_mangle]
pub extern "C" fn allocate(size: usize) -> *mut u8 {
	let v = vec![0u8; size].into_boxed_slice();
    Box::into_raw(v) as _
}

#[no_mangle]
pub extern "C" fn release(ptr: *mut u8) {
	if !ptr.is_null() {
        let _ = unsafe { Box::from_raw(ptr) };
    }
}
```

and then map these to JavaScript functions called `malloc` and `free` in the binding module:

```javascript
let { malloc: _malloc, free: _free } = wasm.instance.exports;
let { allocate: malloc = _malloc, release: free = _free, memory } = wasm.instance.exports;
```

## Compiling from Rust

Apart from the "malloc" and "free" shims above, the rest of the features in Rust consists of 

* a struct definition for the "future":
    ```Rust
    #[repr(C)]
    pub struct Future {
    	data: *mut u8,
    	len: usize,
    	callback: u32,
    	context: u32,
		context_len: usize,
		index: u32
    }
    ```
* an imported `get()` function:
    ```Rust
    extern "C" {
    	pub fn get(callback: fn(&Future) -> Future, input: Future) -> Future;
    }
    ```
* the `callback` dispatcher:
    ```Rust
    #[no_mangle]
    pub extern "C" fn callback(callback: fn(&Future) -> Future, input: &Future) -> Future {
    	return callback(input);
    }
    ```
* and the `call()` entry point:
    ```Rust
    pub extern "C" fn call(input: *mut u8, len: usize) -> Future {
    	let input = Future {
    		data: input,
    		len: len,
    		callback: 0,
    		context: 0,
			context_len: 0,
			index: 0
    	};
    	// business logic to extract stuff from input ...
    	unsafe {
    		return get(status, input);
    	}
    }
    ```

To compile we need to use the "wasm32-wasi" target type ("wasm-unknown-unknown" ought to be sufficient but it generates WASM functions with the wrong signatures). We can also do a short round of optimization:

```
$ cargo build --target=wasm32-wasi
$ wasm-opt -Os target/wasm32-wasi/debug/image.wasm -o image.wasm
```

At this** point the `image.wasm` is ready to run, but the "wasm32-wasi" target type has caused the WASM to be generated with additional WASI imports (that we don't need, but can't seem to optimize away). So we need an implementation of those. [This](https://github.com/devsnek/node-wasi) works:

```
$ npm install --save wasi
```

with

```javascript
import { default as WASI } from "wasi";

let wasi = new WASI({});
let wasm = await WebAssembly.instantiate(file, { "env": { "get": get, "callback": callback }, "wasi_snapshot_preview1": wasi.exports });
wasi.memory = wasm.instance.exports.memory;
```