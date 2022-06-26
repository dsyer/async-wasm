use rmp::{decode, encode};

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

fn extract_image(data: *mut u8, len: usize) -> Option<String> {
    return Some("foobarspam".to_string());
}

fn status(input: &Future) -> Future {
    let mut result = Vec::new();

    let digest = extract_image(input.data, input.len);

    match digest {
        Some(image) => {
            encode::write_map_len(&mut result, 2).unwrap();
            encode::write_str(&mut result, "complete").unwrap();
            encode::write_bool(&mut result, true).unwrap();
            encode::write_str(&mut result, "latest_image").unwrap();
            encode::write_str(&mut result, &image).unwrap();
        }
        None => {
            encode::write_map_len(&mut result, 1).unwrap();
            encode::write_str(&mut result, "complete").unwrap();
            encode::write_bool(&mut result, false).unwrap();
        }
    }

    return Future {
        data: result.as_mut_ptr(),
        len: result.len(),
        callback: input.callback,
        context: input.context,
        clen: input.clen,
        index: input.index,
    };
}

fn reflect(input: &Future) -> Future {
    let mut result = vec![0u8; input.len];
    unsafe {
        std::ptr::copy(input.data, result.as_mut_ptr(), input.len);
    }
    return Future {
        data: result.as_mut_ptr(),
        len: input.len,
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

fn compute_path(input: *mut u8, len: usize) -> Option<String> {
    return Some("localhost:5000/apps/demo".to_string());
}

#[no_mangle]
pub extern "C" fn call(input: *mut u8, len: usize) -> Future {
    let path = compute_path(input, len);
    match path {
        Some(image) => {
            let mut request = Vec::new();
            encode::write_map_len(&mut request, 1).unwrap();
            encode::write_str(&mut request, "url").unwrap();
            encode::write_str(&mut request, &compute_manifest_url(&image)).unwrap();
            let input = Future {
                data: request.as_mut_ptr(),
                len: request.len(),
                callback: 0,
                context: vec![0; 0].as_mut_ptr(),
                clen: 0,
                index: 0,
            };
            unsafe {
                return get(status, &input);
            }
        }
        None => {
            let mut result = Vec::new();
            encode::write_map_len(&mut result, 1).unwrap();
            encode::write_str(&mut result, "complete").unwrap();
            encode::write_bool(&mut result, false).unwrap();
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
    let mut split = fields.split(",");
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
