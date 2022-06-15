with import <nixpkgs> { };

mkShell {

  name = "env";
  buildInputs = [
    figlet emscripten nodejs cmake check libmpack wasmtime wabt binaryen
  ];

  shellHook = ''
    mkdir -p ~/.emscripten
    chmod +w -R ~/.emscripten
    cp -rf ${emscripten}/share/emscripten/cache ~/.emscripten
    export EM_CACHE=~/.emscripten/cache
    figlet -- '-:async-wasm:-'
  '';

}