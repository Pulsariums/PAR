//! Carry-less 32 bit binary range coder (twin of `Encoder` / `Decoder` in rcCore.ts).

/// One binary decision: the encoder writes `bit` and returns it, the decoder ignores it and returns what it read.
pub trait BitIo {
    const ENC: bool;
    unsafe fn bit(&mut self, p: u32, bit: u32) -> u32;
}

pub struct Enc {
    x1: u32,
    x2: u32,
    out: *mut u8,
    cap: usize,
    pub n: usize,
    /// Set when the output buffer is full: the caller retries with a bigger one.
    pub overflow: bool,
}

impl Enc {
    pub fn new(out: *mut u8, cap: usize) -> Enc {
        Enc { x1: 0, x2: 0xffff_ffff, out, cap, n: 0, overflow: false }
    }
    #[inline(always)]
    unsafe fn put(&mut self, b: u8) {
        if self.n < self.cap {
            *self.out.add(self.n) = b;
            self.n += 1;
        } else {
            self.overflow = true;
        }
    }
    pub unsafe fn finish(&mut self) {
        for _ in 0..4 {
            let b = (self.x1 >> 24) as u8;
            self.put(b);
            self.x1 <<= 8;
        }
    }
}

impl BitIo for Enc {
    const ENC: bool = true;
    #[inline(always)]
    unsafe fn bit(&mut self, p: u32, bit: u32) -> u32 {
        let xmid = self.x1.wrapping_add((self.x2.wrapping_sub(self.x1) >> 12).wrapping_mul(p));
        if bit != 0 {
            self.x2 = xmid;
        } else {
            self.x1 = xmid.wrapping_add(1);
        }
        while (self.x1 ^ self.x2) & 0xff00_0000 == 0 {
            let b = (self.x2 >> 24) as u8;
            self.put(b);
            self.x1 <<= 8;
            self.x2 = (self.x2 << 8) | 255;
        }
        bit
    }
}

pub struct Dec {
    x1: u32,
    x2: u32,
    x: u32,
    buf: *const u8,
    len: usize,
    pos: usize,
}

impl Dec {
    /// Reads from `buf[start..len]`; bytes past the end read as 0, like the TypeScript decoder.
    pub unsafe fn new(buf: *const u8, len: usize, start: usize) -> Dec {
        let mut d = Dec { x1: 0, x2: 0xffff_ffff, x: 0, buf, len, pos: start };
        for _ in 0..4 {
            d.x = (d.x << 8) | d.next();
        }
        d
    }
    #[inline(always)]
    unsafe fn next(&mut self) -> u32 {
        if self.pos < self.len {
            let b = *self.buf.add(self.pos);
            self.pos += 1;
            b as u32
        } else {
            0
        }
    }
}

impl BitIo for Dec {
    const ENC: bool = false;
    #[inline(always)]
    unsafe fn bit(&mut self, p: u32, _bit: u32) -> u32 {
        let xmid = self.x1.wrapping_add((self.x2.wrapping_sub(self.x1) >> 12).wrapping_mul(p));
        let y = (self.x <= xmid) as u32;
        if y != 0 {
            self.x2 = xmid;
        } else {
            self.x1 = xmid.wrapping_add(1);
        }
        while (self.x1 ^ self.x2) & 0xff00_0000 == 0 {
            self.x1 <<= 8;
            self.x2 = (self.x2 << 8) | 255;
            self.x = (self.x << 8) | self.next();
        }
        y
    }
}
