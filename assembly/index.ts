@external("env", "get")
declare function get(output: Future, callback: i32, input: Future): void

import * as msgpack from '@wapc/as-msgpack/assembly/index';
import { E_INDEXOUTOFRANGE } from 'assemblyscript/std/assembly/util/error';

@unmanaged
class Future {
  data: usize;
  len: usize;
  callback: i32;
  context: usize;
  clen: usize;
  index: usize;
}

class Request {
  url: string | null;
  headers: Map<string, string> | null;
}


export function malloc(size: usize): usize {
  return heap.alloc(size);
}

export function free(ptr: usize) : void {
  heap.free(ptr);
}

function reset(input: Future) : void {
  input.index = 0;
  input.callback = 0;
  input.data = 0;
  input.len = 0;
}

function status(output: Future, input: Future): void {
  // TODO: process response
  reset(output);
  output.data = input.data;
  output.len = input.len;
}

export function callback(output: Future, fn: i32, input: Future): void {
  call_indirect(fn, output, input);
}

export function call(output: Future, data: i32, len: i32): void {
  var input: Future = new Future();
  input.data = data;
  input.len = len;
  storeRequest(input, loadRequest(input));
  // TODO set context to url
  get(output, status.index, input);
}


function loadRequest(input: Future): Request {
  var result = new Uint8Array(i32(input.len));
  for (var i = 0; i < i32(input.len); i++) {
    result[i] = load<u8>(input.data + i);
  }
  var decoder = new msgpack.Decoder(result.buffer);
  var msg = new Request();
  decoder.readMapSize();
  // TODO: url needs to be computed from image.spec
  decoder.readString();
  var value = decoder.readString();  
  msg.url = value;
  return msg;
}

function encode(value: Request, writer: msgpack.Writer) : void {
  const len = value.headers!==null ? 2 : 1;
  writer.writeMapSize(len);
  writer.writeString("url");
  writer.writeString(value.url!);
  if (value.headers!==null) {
    writer.writeString("headers");
    writer.writeMapSize(value.headers!.size);
    for (var i = 0; i < value.headers!.size; i++) {
      var key = value.headers!.keys()[i];
      var val = value.headers!.get(key);
      writer.writeString(key);
      writer.writeString(val);
    }
  }
}

function storeRequest(output: Future, value: Request): void {
  const sizer = new msgpack.Sizer();
  encode(value, sizer);
  var bytes = new Uint8Array(sizer.length);
  encode(value, new msgpack.Encoder(bytes.buffer));
  output.data = malloc(bytes.byteLength);
  output.len = bytes.byteLength;
  for (var i = 0; i < bytes.byteLength; i++) {
    store<u8>(output.data + i, bytes[i]);
  }
}
