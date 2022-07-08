@external("env", "get")
declare function get(output: Future, callback: i32, input: Future): void

import * as msgpack from '@wapc/as-msgpack/assembly/index';

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

class Response {
  status: i32;
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
  var response: Response = unpack(input, extractResponse);
  pack(output, response, encodeResponse);
}

export function callback(output: Future, fn: i32, input: Future): void {
  call_indirect(fn, output, input);
}

export function call(output: Future, data: i32, len: i32): void {
  var input: Future = new Future();
  input.data = data;
  input.len = len;
  var request: Request = unpack(input, extractImageRequest);
  pack(input, request, encodeRequest);
  storeUrl(input, request.url!);
  get(output, status.index, input);
}

function storeUrl(output: Future, url: string) : void {
  const len = url.length;
  const offset = malloc(len);
  output.context = offset;
  output.clen = len;
  for (var i = 0; i < url.length; i++) {
    store<u8>(offset + i, url.charCodeAt(i));
  }
}

function extractResponse(decoder: msgpack.Decoder) : Response {
  var msg = new Response();
  const len = decoder.readMapSize();
  for (var index : u32 = 0; index < len; index++) {
    var key = decoder.readString();
    if (key == "status") {
      msg.status = decoder.readInt32();
    } else if (key == "headers") {
      msg.headers = new Map<string, string>();
      const size = decoder.readMapSize();
      for (var i : u32 = 0; i<size; i++) {
        var header = decoder.readString();
        // TODO: set-cookie is an array
        if (header !== "set-cookie") {
          var value = decoder.readString();
          msg.headers!.set(header, value);
        } else {
          decoder .skip();
        }
      }
    } else {
      decoder.skip();
    }
  }
  return msg;
}

function extractImageRequest(decoder: msgpack.Decoder) : Request {
  var msg = new Request();
  decoder.readMapSize();
  // TODO: url needs to be computed from image.spec
  decoder.readString();
  var value = decoder.readString();  
  msg.url = value;
  return msg;
}

function unpack<T>(input: Future, decode: (decoder: msgpack.Decoder) => T): T {
  var bytes = new Uint8Array(i32(input.len));
  for (var i = 0; i < i32(input.len); i++) {
    bytes[i] = load<u8>(input.data + i);
  }
  var decoder = new msgpack.Decoder(bytes.buffer);
  return decode(decoder);
}

function encodeRequest(value: Request, writer: msgpack.Writer) : void {
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

function encodeResponse(value: Response, writer: msgpack.Writer) : void {
  const len = value.headers!==null ? 2 : 1;
  writer.writeMapSize(len);
  writer.writeString("status");
  writer.writeInt32(value.status);
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

function pack<T>(output: Future, value: T, write: (value: T, writer: msgpack.Writer) => void): void {
  const sizer = new msgpack.Sizer();
  write(value, sizer);
  var bytes = new Uint8Array(sizer.length);
  write(value, new msgpack.Encoder(bytes.buffer));
  output.data = malloc(bytes.byteLength);
  output.len = bytes.byteLength;
  for (var i = 0; i < bytes.byteLength; i++) {
    store<u8>(output.data + i, bytes[i]);
  }
}
