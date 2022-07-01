@external("env", "get")
declare function get(output: Future, callback: i32, input: Future): void
@external("env", "console.log")
declare function print(value: i32): void

class Future {
  constructor() {} // !
  data: i32
  len: i32
}

export function malloc(size: i32): usize {
  return heap.alloc(size);
}

export function free(ptr: usize) : void {
  heap.free(ptr);
}

export function newFuture() : Future {
  return new Future();
}

function status(output: Future, input: Future): void {
  output.data = input.data + 1;
  output.len = input.len * 2;
  print(output.data);
  print(output.len);
}

export function callback(output: Future, fn: i32, input: Future): void {
  call_indirect(fn, output, input);
}

export function call(output: Future, data: i32, len: i32): void {
  var input: Future = new Future();
  input.data = data;
  input.len = len;
  return get(output, status.index, input)
}