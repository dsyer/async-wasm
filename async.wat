(module
  (type $0 (func (param i32)))
  (type $1 (func (param i32) (result i32)))
  (import "env" "get" (func $get (type $0)))
  (memory $0 256 256)
  (func $call (type $0) (param $input i32)
    local.get $input
    call $get
  )
  (func $callback (type $1) (param $value i32) (result i32)
    local.get $value
    i32.const 321
    i32.add
  )
  (export "call" (func $call))
  (export "callback" (func $callback))
)