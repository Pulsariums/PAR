//! Block level of the XPAR stream coder (twin of `rcEncode` / `rcDecode` in src/format/rc.ts).
//! The stream table is parsed and validated by the TypeScript side; this only runs the heavy loop.
use crate::coder::{Dec, Enc};
use crate::pred::Pred;
use crate::symbols::Sym;

const KEY_STR: u32 = 4;

/// Parameters, written by JS as consecutive little-endian u32 (see rcWasm.ts, `JOB_WORDS`): on wasm32 pointers are u32.
#[repr(C)]
pub struct Job {
    pub tables: *mut u16,
    pub bits: u32,
    pub stretch: *const f32,
    pub squash: *const f32,
    pub w: *mut f32,
    pub data: *const u8,
    pub data_len: usize,
    pub head: usize,
    pub keys: *const u32,
    pub lens: *const u32,
    pub n: usize,
    pub out: *mut u8,
    pub out_cap: usize,
}

unsafe fn pred(j: &Job) -> Pred {
    Pred::new(j.bits, j.tables, j.stretch, j.squash, j.w)
}

/// True when `b` is made only of canonical LEB128 numbers (the TypeScript `asNumbers`).
unsafe fn canonical(b: &[u8]) -> bool {
    let mut n = 0u32;
    for &c in b {
        n += 1;
        if c < 128 {
            if (c == 0 && n > 1) || n > 7 {
                return false;
            }
            n = 0;
        } else if n > 7 {
            return false;
        }
    }
    n == 0
}

/// Returns the number of body bytes written to `out`, or -1 when `out_cap` was too small.
pub unsafe fn encode(j: &Job) -> i32 {
    let raw = j.data;
    let mut sc = Sym::new(pred(j), Enc::new(j.out, j.out_cap));
    let mut pos = j.head;
    for s in 0..j.n {
        let key = *j.keys.add(s);
        let len = *j.lens.add(s) as usize;
        let body = core::slice::from_raw_parts(raw.add(pos), len);
        pos += len;
        let nums = key != KEY_STR && canonical(body);
        sc.begin(key);
        sc.flag(nums as u32);
        if nums {
            let (mut v, mut mul) = (0u64, 1u64);
            for &c in body {
                v += (c & 127) as u64 * mul;
                if c < 128 {
                    sc.num(v);
                    v = 0;
                    mul = 1;
                } else {
                    mul *= 128;
                }
            }
        } else {
            for &c in body {
                sc.byte(c as u32);
            }
        }
    }
    sc.io.finish();
    if sc.io.overflow {
        -1
    } else {
        sc.io.n as i32
    }
}

/// Decodes into `out[head..]` (the caller copies the table). 0 = ok, 1 = a numeric stream overruns its length.
pub unsafe fn decode(j: &Job) -> i32 {
    let out = j.out;
    let mut sc = Sym::new(pred(j), Dec::new(j.data, j.data_len, j.head));
    let mut pos = j.head;
    for s in 0..j.n {
        let key = *j.keys.add(s);
        let end = pos + *j.lens.add(s) as usize;
        sc.begin(key);
        if sc.flag(0) != 0 {
            while pos < end {
                let mut v = sc.num(0);
                let mut l = 1;
                let mut t = v;
                while t >= 128 {
                    t /= 128;
                    l += 1;
                }
                if pos + l > end {
                    return 1;
                }
                while v >= 128 {
                    *out.add(pos) = (v % 128) as u8 | 128;
                    pos += 1;
                    v /= 128;
                }
                *out.add(pos) = v as u8;
                pos += 1;
            }
        } else {
            while pos < end {
                *out.add(pos) = sc.byte(0) as u8;
                pos += 1;
            }
        }
    }
    0
}
