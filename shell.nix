# nix-channel --add https://nixos.org/channels/nixos-21.11
# nix-channel --update
with import <nixos-21.11> { };

mkShell {

  name = "env";
  buildInputs = [
    rustup rustc cargo figlet nodejs cmake check libmpack wasmtime wabt binaryen
  ];

  RUSTC_VERSION = "nightly";
  shellHook = ''
    export TMP=/tmp
    export TMPDIR=/tmp
    RUSTUP_HOME=~/.rustup
    rustup install $RUSTC_VERSION
    rustup default $RUSTC_VERSION
    export PATH=$PATH:~/.cargo/bin
    export PATH=$PATH:~/.rustup/toolchains/$RUSTC_VERSION-x86_64-unknown-linux-gnu/bin
    figlet -- '-:async-wasm:-'
  '';

}