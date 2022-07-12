use std::{slice};

use rmpv::{decode, encode, Utf8String, Value};

#[repr(C)]
pub struct Future {
    data: *mut u8,
    len: usize,
    callback: u32,
    context: *mut u8,
    clen: usize,
    index: u32,
}

extern "C" {
    pub fn get(callback: fn(&Future) -> Future, input: &Future) -> Future;
}

fn extract_image(values: Vec<(Value, Value)>) -> Option<String> {
    let headers = find_value(&values, "headers");
    if headers == Value::Nil || !headers.is_map() {
        return None;
    }
    let mut digest = find_value(headers.as_map().unwrap(), "docker-content-digest");
    if digest == Value::Nil || !digest.is_str() {
        digest = find_value(headers.as_map().unwrap(), "Docker-Content-Digest");
        if digest == Value::Nil || !digest.is_str() {
            return None;
        }
    }
    return Some(digest.as_str().unwrap().to_string());
}

fn reset(input: &Future) -> Future {
    return Future {
        data: std::ptr::null_mut(),
        len: 0,
        callback: 0,
        context: input.context,
        clen: input.clen,
        index: 0,
    };
}

fn token(input: &Future) -> Future {
    let response = unpack_value(input.data, input.len);
    let mut result = reset(input);
    let data = find_value(&response, "data");
    if data == Value::Nil || !data.is_map() {
        return result;
    }
    let token = find_value(data.as_map().unwrap(), "token");
    if token == Value::Nil || !token.is_str() {
        return result;
    }
    let mut auth = String::new();
    auth.push_str("Bearer ");
    auth.push_str(token.as_str().unwrap());
    let mut request = Vec::new();
    let mut value = vec![];

    let url = get_string_context(input);
    value.push((
        Value::String(Utf8String::from("url")),
        Value::String(Utf8String::from(url)),
    ));
    value.push((
        Value::String(Utf8String::from("headers")),
        Value::Map(vec![(
            Value::String(Utf8String::from("authorization")),
            Value::String(Utf8String::from(auth)),
        )]),
    ));
    encode::write_value(&mut request, &Value::Map(value)).ok();
    result.data = request.as_mut_ptr();
    result.len = request.len();

    unsafe {
        return get(status, &result);
    }
}

fn get_string_context(input: &Future) -> String {
    let mut result = vec![0u8; input.len];
    unsafe {
        std::ptr::copy(input.context, result.as_mut_ptr(), input.clen);
    }
    return String::from_utf8(result).ok().unwrap();
}

fn authentication(input: &Future) -> Future {
    let response = unpack_value(input.data, input.len);
    let mut result = reset(input);
    let headers = find_value(&response, "headers");
    if headers == Value::Nil || !headers.is_map() {
        return result;
    }
    let mut auth = find_value(headers.as_map().unwrap(), "www-authenticate");
    if auth == Value::Nil || !auth.is_str() {
        auth = find_value(headers.as_map().unwrap(), "WWW-Authenticate");
        if auth == Value::Nil || !auth.is_str() {
            return result;
        }
    }

    let mut request = Vec::new();
    let mut value = vec![];
    let fields = auth.as_str().unwrap().to_string();

    if fields.len() == 0 || fields.contains("error=") {
        value.push((
            Value::String(Utf8String::from("complete")),
            Value::Boolean(false),
        ));
        encode::write_value(&mut request, &Value::Map(value)).ok();
        result.data = request.as_mut_ptr();
        result.len = request.len();
        return result;
    }
    let url = compute_token_url(&fields);
    value.push((
        Value::String(Utf8String::from("url")),
        Value::String(Utf8String::from(url)),
    ));
    encode::write_value(&mut request, &Value::Map(value)).ok();
    result.data = request.as_mut_ptr();
    result.len = request.len();

    unsafe {
        return get(token, &result);
    }
}

fn status(input: &Future) -> Future {
    let mut result = Vec::new();

    let response = unpack_value(input.data, input.len);
    let code = find_value(&response, "status");
    if code.is_number() && code.as_u64().unwrap() == 401 {
        return authentication(input);
    }
    let digest = extract_image(response);

    let mut value = vec![];
    match digest {
        Some(image) => {
            value.push((
                Value::String(Utf8String::from("complete")),
                Value::Boolean(true),
            ));
            value.push((
                Value::String(Utf8String::from("latestImage")),
                Value::String(Utf8String::from(image)),
            ));
        }
        None => {
            value.push((
                Value::String(Utf8String::from("complete")),
                Value::Boolean(false),
            ));
        }
    }
    encode::write_value(&mut result, &Value::Map(value)).ok();

    return Future {
        data: result.as_mut_ptr(),
        len: result.len(),
        callback: input.callback,
        context: input.context,
        clen: input.clen,
        index: input.index,
    };
}

#[no_mangle]
pub extern "C" fn allocate(size: usize) -> *mut u8 {
    let v = vec![0u8; size].into_boxed_slice();
    Box::into_raw(v) as _
}

#[no_mangle]
pub extern "C" fn release(ptr: *mut u8) {
    if !ptr.is_null() {
        let _ = unsafe { Box::from_raw(ptr) };
    }
}

#[no_mangle]
pub extern "C" fn callback(callback: fn(&Future) -> Future, input: &Future) -> Future {
    return callback(input);
}

fn find_value(values: &Vec<(Value, Value)>, key: &str) -> Value {
    for value in values.iter() {
        if value.0.is_str() && key.eq(value.0.as_str().unwrap()) {
            return value.1.clone();
        }
    }
    return Value::Nil;
}

fn unpack_value(input: *mut u8, len: usize) -> Vec<(Value, Value)> {
    unsafe {
        let data = Vec::from(slice::from_raw_parts(input, len));
        let result = decode::read_value(&mut &data[..]).ok().unwrap();
        return result.as_map().unwrap().to_vec();
    }
}

fn compute_path(input: *mut u8, len: usize) -> Option<String> {
    let values = unpack_value(input, len);
    let spec = find_value(&values, "spec");
    if spec == Value::Nil || !spec.is_map() {
        return None;
    }
    let image = find_value(spec.as_map().unwrap(), "image");
    if image == Value::Nil || !image.is_str() {
        return None;
    }
    return Some(image.as_str().unwrap().to_string());
}

#[no_mangle]
pub extern "C" fn call(input: *mut u8, len: usize) -> Future {
    let path = compute_path(input, len);
    match path {
        Some(image) => {
            let mut request = Vec::new();
            let url = &compute_manifest_url(&image);
            encode::write_value(
                &mut request,
                &Value::Map(vec![(
                    Value::String(Utf8String::from("url")),
                    Value::String(Utf8String::from(url.as_str())),
                )]),
            )
            .ok();
            let data = allocate(url.len());
            let sliced = unsafe { slice::from_raw_parts_mut(data, url.len()) };
            sliced[..].copy_from_slice(url.as_bytes());
            let input = Future {
                data: request.as_mut_ptr(),
                len: request.len(),
                callback: 0,
                context: data,
                clen: url.len(),
                index: 0,
            };
            unsafe {
                return get(status, &input);
            }
        }
        None => {
            let mut result = Vec::new();
            encode::write_value(
                &mut result,
                &Value::Map(vec![(
                    Value::String(Utf8String::from("complete")),
                    Value::Boolean(false),
                )]),
            )
            .ok();
            return Future {
                data: result.as_mut_ptr(),
                len: result.len(),
                callback: 0,
                context: vec![0; 0].as_mut_ptr(),
                clen: 0,
                index: 0,
            };
        }
    }
}

fn find(fields: &str, field: &str) -> String {
    let split = fields.split(",");
    for value in split {
        if value.starts_with(field) {
            let suffix = value.replacen(field, "", 1);
            if suffix.starts_with('"') {
                return suffix.replace('"', "");
            } else {
                return suffix;
            }
        }
    }
    return String::from("");
}

fn compute_token_url(auth: &str) -> String {
    let mut result = String::new();
    if !auth.starts_with("Bearer ") {
        return result;
    }
    let fields = String::from(auth.replacen("Bearer ", "", 1));
    let realm = find(&fields, "realm=");
    let scope = find(&fields, "scope=");
    let service = find(&fields, "service=");
    if realm.len() == 0 || scope.len() == 0 || service.len() == 0 {
        return String::from("");
    }
    result.push_str(&realm);
    result.push_str("?service=");
    result.push_str(&service);
    result.push_str("&scope=");
    result.push_str(&scope);
    return result;
}

fn compute_manifest_url(path: &str) -> String {
    let label = "latest";
    let mut protocol = "https://";
    let mut result = String::new();
    let mut value = String::new();
    if !path.contains("/") {
        value.push_str("library/");
    }
    value.push_str(path);
    if path.starts_with("localhost") {
        protocol = "http://";
    }
    if !path.starts_with("http") {
        result.push_str(protocol);
    }
    if !path.contains(".") && !path.contains(":") {
        result.push_str("index.docker.io/v2/");
    } else {
        value = value.replacen("/", "/v2/", 1);
    }
    result.push_str(&value);
    result.push_str("/manifests/");
    result.push_str(label);
    return result;
}

#[cfg(test)]
mod test;
