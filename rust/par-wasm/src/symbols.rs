//! Symbol layer (twin of `SymbolCoder` in rcSym.ts): numbers as zero flag + unary bit length + mantissa, bytes as 8 decisions.
use crate::coder::BitIo;
use crate::pred::{hash, Pred};

pub struct Sym<IO: BitIo> {
    pub pr: Pred,
    pub io: IO,
    key: u32,
    p1: u32,
    p2: u32,
    p3: u32,
    x1: u32,
}

impl<IO: BitIo> Sym<IO> {
    pub fn new(pr: Pred, io: IO) -> Sym<IO> {
        Sym { pr, io, key: 0, p1: 0, p2: 0, p3: 0, x1: 0 }
    }

    pub fn begin(&mut self, key: u32) {
        self.key = key;
        self.p1 = 0;
        self.p2 = 0;
        self.p3 = 0;
        self.x1 = 0;
    }

    #[inline(always)]
    unsafe fn bit(&mut self, node: u32, cls: usize, bit: u32) -> u32 {
        let p = self.pr.p(node, cls);
        let b = self.io.bit(p, bit);
        self.pr.update(b);
        b
    }

    /// One non-negative integer (< 2^53); the decoder ignores `v` and returns the decoded value.
    pub unsafe fn num(&mut self, v: u64) -> u64 {
        let k = self.key;
        self.pr.ctx(
            hash(k, self.p1),
            hash(k.wrapping_add(1_000_003), self.x1),
            hash(hash(k.wrapping_add(2_000_003), self.p1), (self.p2 * 64 + self.p3) as u32),
            k,
        );
        let zero = self.bit(0, 0, (IO::ENC && v == 0) as u32);
        let mut out: u64 = 0;
        let mut nb: u32 = 0;
        if zero == 0 {
            let want = if IO::ENC { 64 - v.leading_zeros() } else { 0 };
            nb = 1;
            while nb < 53 && self.bit(nb, if nb < 4 { nb as usize } else { 4 }, (IO::ENC && want > nb) as u32) != 0 {
                nb += 1;
            }
            out = 1;
            let mut prefix: u32 = 1;
            let mut i = nb as i32 - 2;
            while i >= 0 {
                let kk = (nb as i32 - 2 - i) as u32;
                let b = if IO::ENC { ((v >> i) & 1) as u32 } else { 0 };
                let bit = if kk < 3 { self.bit(64 + nb * 16 + prefix, (5 + kk) as usize, b) } else { self.bit(2048 + nb * 64 + kk, 7, b) };
                out = out * 2 + bit as u64;
                if kk < 3 {
                    prefix = prefix * 2 + bit;
                }
                i -= 1;
            }
        }
        let val = if IO::ENC { v } else { out };
        self.p3 = self.p2;
        self.p2 = self.p1;
        self.p1 = if zero != 0 { 0 } else { nb };
        self.x1 = if val < 65536 { val as u32 } else { 65536 + (val % 65521) as u32 };
        val
    }

    /// One byte (string streams).
    pub unsafe fn byte(&mut self, c: u32) -> u32 {
        let k = self.key;
        let h = hash(k, 0x51ed27);
        self.pr.ctx(h, hash(h, self.p1 + 256), hash(hash(k, self.p1 + 256), self.p2 + 65536), k);
        let mut node: u32 = 1;
        for bp in 0..8u32 {
            let b = if IO::ENC { (c >> (7 - bp)) & 1 } else { 0 };
            node = node * 2 + self.bit(node, bp as usize, b);
        }
        let out = node & 255;
        self.p2 = self.p1;
        self.p1 = out;
        out
    }

    /// Equiprobable flag (stream mode).
    pub unsafe fn flag(&mut self, v: u32) -> u32 {
        self.io.bit(2048, v)
    }
}
