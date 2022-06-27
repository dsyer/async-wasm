
target := target
wasm := image.wasm
platform := wasm32-unknown-unknown

ALL: $(wasm)

src := $(shell find src -name '*.rs')

$(wasm): $(src) Cargo.toml
	cargo build --target=$(platform)
	wasm-opt -Os $(target)/$(platform)/debug/image.wasm -o $(wasm)

clean:
	rm -rf $(target) $(wasm)