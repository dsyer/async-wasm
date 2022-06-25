#[repr(C)]
pub struct Future {
    data: *mut u8,
    len: usize,
    callback: u32,
    context: u32,
    clen: usize,
    index: u32,
}

extern "C" {
    pub fn get(callback: fn(&Future) -> Future, input: &Future) -> Future;
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

#[no_mangle]
pub extern "C" fn call(input: *mut u8, len: usize) -> Future {
    let input = Future {
        data: input,
        len: len,
        callback: 0,
        context: 0,
		clen: 0,
		index: 0
    };
    unsafe {
        return get(reflect, &input);
    }
}
