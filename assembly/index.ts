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

class Status {
  complete: bool;
  latestImage: string | null;
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
  const result = heap.alloc(size);
  memory.fill(result, size as u8, 0);
  return result;
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
  reset(output);
  var response: Response = unpack(input, extractResponse);
  var result = new Status();
  if (response.headers) {
    var digest = response.headers!.get("docker-content-digest");
    if (!digest) {
      digest = response.headers!.get("Docker-Content-Digest");
    }
    if (digest) {
      result.complete = true;
      result.latestImage = digest;
    }
  }
  pack(output, result, encodeStatus);
}

export function callback(output: Future, fn: i32, input: Future): void {
  call_indirect(fn, output, input);
}

export function call(output: Future, data: i32, len: i32): void {
  var input: Future = new Future();
  input.data = data;
  input.len = len;
  var request: Request = unpack(input, extractImageRequest);
  if (!request.url) {
    var result = new Status();
    result.complete = false;
    pack(output, result, encodeStatus);
    return;
  }
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
  if (decoder.isNextNil()) {
    return msg;
  }
  const len = decoder.readMapSize();
  for (var index : u32 = 0; index < len; index++) {
    var key = decoder.readString();
    if (key == "status") {
      msg.status = decoder.readInt32();
    } else if (key == "headers") {
      msg.headers = new Map<string, string>();
      if (!decoder.isNextNil()) {
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
      }
    } else {
      decoder.skip();
    }
  }
  return msg;
}

function computeManifestUrl(path: string): string {
  const label = "latest"; // TODO: compute from path
  var protocol = "https://";
  if (!path.includes("/")) {
    path = "library/" + path;
  }
  if (!path.includes(".") && !path.includes(":"))
  {
    // No host
    path = "index.docker.io/" + path;
  }
  path = path.replace("/", "/v2/");
  if (path.startsWith("localhost")) {
    protocol = "http://"
  }
  return protocol + path + "/manifests/" + label;
}

function extractImageRequest(decoder: msgpack.Decoder) : Request {
  var msg = new Request();
  var size = decoder.readMapSize();
  for (var i: u32 = 0; i<size; i++) {
    var key = decoder.readString();
    if (key == "spec") {
      var spec_size = decoder.readMapSize();
      for (var j: u32 = 0; j<spec_size; j++) {
        key = decoder.readString();
        if (key == "image") {
          var value = decoder.readString();  
          msg.url = computeManifestUrl(value);
          return msg;
        } else {
          decoder.skip();
        }
      }
    } else {
      decoder.skip();
    }
  }
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

function encodeStatus(value: Status, writer: msgpack.Writer) : void {
  const len = value.latestImage!==null ? 2 : 1;
  writer.writeMapSize(len);
  writer.writeString("complete");
  writer.writeBool(value.complete);
  if (value.latestImage!==null) {
    writer.writeString("latestImage");
    writer.writeString(value.latestImage!);
  }
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
