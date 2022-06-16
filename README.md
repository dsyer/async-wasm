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

## Docker Image Processor

As a more "real" example we can try and write a Kubernetes resource transformation. The goal is to look in the input payload for `spec.image` and use that to extract a SHA256 label for the latest image in a Docker repository. The code for that is in `image.c`, where the call to the repository is through an external "get" function, which has to be imported into the WASM. The JavaScript implementation uses the `http` module in Node.js via a local library called "runtime".

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