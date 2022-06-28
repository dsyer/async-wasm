
target := target
build := build
wasm := image.wasm
platform := wasm32-unknown-unknown

ALL: rust c

src := $(shell find src -name '*.rs')

$(target)/$(wasm): $(src) Cargo.toml
	cargo build --target=$(platform)
	wasm-opt -Os $(target)/$(platform)/debug/image.wasm -o $(target)/$(wasm)
	cp $(target)/$(wasm) $(wasm)

$(build)/$(wasm): image.c lib/libmpack.a
	mkdir -p $(build)
	emcc -Os -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s EXPORTED_FUNCTIONS="[_call,_callback, _malloc, _free]" -Wl,--no-entry -I include image.c lib/libmpack.a -o $(build)/$(wasm)
	wasm-opt -Os $(build)/$(wasm) -o $(wasm)

lib/libmpack.a:
	curl -L https://github.com/dsyer/mpack-wasm/releases/download/v1.1-0.0.1/mpack-wasm.tgz | tar -xzf -

rust: $(target)/$(wasm)

c: $(build)/$(wasm)

clean:
	rm -rf $(target) $(build) $(wasm)