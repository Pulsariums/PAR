//! PAR WebAssembly kernels. `no_std`, no dependencies, no allocator: every buffer lives in linear memory that the JavaScript
//! side lays out (see src/wasm/). Each export takes one pointer to a job record and runs one pure routine.
#![no_std]
#![allow(clippy::missing_safety_doc)]

mod coder;
mod pred;
mod rc;
mod symbols;

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

/// XPAR stream coder, encode. Returns body bytes written, or -1 if the output buffer was too small.
#[no_mangle]
pub unsafe extern "C" fn rc_encode(job: *const rc::Job) -> i32 {
    rc::encode(&*job)
}

/// XPAR stream coder, decode. Returns 0, or 1 when a numeric stream overruns its length (corrupt data).
#[no_mangle]
pub unsafe extern "C" fn rc_decode(job: *const rc::Job) -> i32 {
    rc::decode(&*job)
}
