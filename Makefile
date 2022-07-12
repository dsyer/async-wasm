
target := target
build := build
wasm := image.wasm
platform := wasm32-unknown-unknown

ALL: rust c

src := $(shell find src -name '*.rs')

WASI_VERSION = 16
WASI_VERSION_FULL := $(WASI_VERSION).0

WASI_SDK_PATH := tmp/wasi-sdk-$(WASI_VERSION_FULL)
CLANG := $(WASI_SDK_PATH)/bin/clang
LD := $(WASI_SDK_PATH)/bin/wasm-ld

COMPILE_FLAGS := -Os -I ./include

%.o: %.c Makefile $(WASI_SDK_PATH)
	mkdir -p $(build)
	$(CLANG) --sysroot=${WASI_SDK_PATH}/share/wasi-sysroot \
		-v -c \
		$(COMPILE_FLAGS) \
		-o $(build)/$@ \
		$<

$(build)/$(wasm): image.o lib/libmpack.a 
	mkdir -p $(build)
	$(LD) -L ${WASI_SDK_PATH}/share/wasi-sysroot/lib/wasm32-wasi \
		-o $(build)/$(wasm) --no-entry --export=call --export=callback --export=malloc --export=free \
		--strip-all \
		--export-dynamic \
		--allow-undefined \
		--initial-memory=131072 \
		-error-limit=0 \
		--lto-O3 \
		-O3 \
		--gc-sections \
		-lc \
		$(build)/image.o lib/libmpack.a
	wasm-opt --enable-bulk-memory -Os $(build)/$(wasm) -o $(wasm)

test: test-c test-rust test-as

test-c: c
	cp $(build)/$(wasm) $(wasm)
	npm test | tee -a $(build)/test.log

test-rust: rust
	cp $(target)/$(wasm) $(wasm)
	npm test | tee -a $(build)/test.log

test-as: as
	cp $(build)/debug.wasm $(wasm)
	npm test | tee -a $(build)/test.log

$(WASI_SDK_PATH): 
	mkdir -p tmp
	cd tmp && curl -L https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_VERSION}/wasi-sdk-${WASI_VERSION_FULL}-linux.tar.gz | tar -xzf -

$(target)/$(wasm): $(src) Cargo.toml
	cargo build --target=$(platform)
	wasm-opt -Os $(target)/$(platform)/debug/image.wasm -o $(target)/$(wasm)
	cp $(target)/$(wasm) $(wasm)

$(build)/debug.wasm: assembly/index.ts
	npm run asbuild
	wasm-opt -Os $(build)/debug.wasm --enable-sign-ext --enable-bulk-memory -o $(wasm)

lib/libmpack.a:
	curl -L https://github.com/dsyer/mpack-wasm/releases/download/v1.1-0.0.1/mpack-wasm.tgz | tar -xzf -

rust: $(target)/$(wasm)

c: $(build)/$(wasm)

as: $(build)/debug.wasm

clean:
	rm -rf $(target) $(build) $(wasm)