//! Three-input logistic mixing predictor. Bit-exact twin of `Predictor` in src/format/rcCore.ts:
//! arithmetic is IEEE f64 on f32-stored weights/tables, exactly the order JavaScript evaluates it in.

/// Mixer weight sets (`SETS * 4` f32), as in rcCore.ts.
pub const SETS: usize = 2048;

/// `Math.imul(a ^ ..)` hash of rcCore.ts.
#[inline(always)]
pub fn hash(a: u32, b: u32) -> u32 {
    (a ^ b.wrapping_add(0x7f4a_7c15).wrapping_mul(0x9e37_79b1)).wrapping_mul(0x85eb_ca6b)
}

/// Everything lives in caller-provided linear memory (no statics, no allocator).
pub struct Pred {
    t: [*mut u16; 3],
    stretch: *const f32,
    squash: *const f32,
    w: *mut f32,
    sh: u32,
    c: [u32; 3],
    wb: usize,
    wi: usize,
    idx: [usize; 3],
    s: [f64; 3],
    pr: f64,
}

impl Pred {
    /// `tables`: three consecutive u16 tables of `1 << bits` entries each.
    ///
    /// # Safety
    /// All pointers must be valid for the sizes the JS side allocates (see rcWasm.ts).
    pub unsafe fn new(bits: u32, tables: *mut u16, stretch: *const f32, squash: *const f32, w: *mut f32) -> Pred {
        let n = 1usize << bits;
        let t = [tables, tables.add(n), tables.add(2 * n)];
        for tp in t {
            for k in 0..n {
                *tp.add(k) = 32768;
            }
        }
        let mut k = 0;
        while k < SETS * 4 {
            *w.add(k) = 0.35;
            *w.add(k + 1) = 0.4;
            *w.add(k + 2) = 0.4;
            *w.add(k + 3) = 0.0;
            k += 4;
        }
        Pred { t, stretch, squash, w, sh: 32 - bits, c: [0; 3], wb: 0, wi: 0, idx: [0; 3], s: [0.0; 3], pr: 0.5 }
    }

    #[inline(always)]
    pub fn ctx(&mut self, c0: u32, c1: u32, c2: u32, weight_key: u32) {
        self.c = [c0, c1, c2];
        self.wb = ((hash(weight_key, 77) >> 21) as usize * 8) % SETS;
    }

    /// P(bit = 1) in 1..4095 for decision `node`; `cls` selects the mixer weights within the family.
    #[inline(always)]
    pub unsafe fn p(&mut self, node: u32, cls: usize) -> u32 {
        let wi = (self.wb + cls) * 4;
        self.wi = wi;
        let mut s = [0.0f64; 3];
        for j in 0..3 {
            let i = (self.c[j].wrapping_add(node).wrapping_mul(0x9e37_79b1) >> self.sh) as usize;
            self.idx[j] = i;
            s[j] = *self.stretch.add((*self.t[j].add(i) >> 4) as usize) as f64;
        }
        self.s = s;
        let w = self.w;
        let mut dot = *w.add(wi + 3) as f64 * 0.3 + *w.add(wi) as f64 * s[0] + *w.add(wi + 1) as f64 * s[1] + *w.add(wi + 2) as f64 * s[2];
        dot = if dot > 11.99 { 11.99 } else if dot < -11.99 { -11.99 } else { dot };
        let pr = *self.squash.add(((dot * 170.667) as i32 + 2048) as usize) as f64;
        self.pr = pr;
        let p = (pr * 4096.0) as i32;
        (if p < 1 { 1 } else if p > 4095 { 4095 } else { p }) as u32
    }

    #[inline(always)]
    pub unsafe fn update(&mut self, bit: u32) {
        let err = (bit as f64 - self.pr) * 0.02;
        let w = self.w;
        let wi = self.wi;
        *w.add(wi) = (*w.add(wi) as f64 + err * self.s[0]) as f32;
        *w.add(wi + 1) = (*w.add(wi + 1) as f64 + err * self.s[1]) as f32;
        *w.add(wi + 2) = (*w.add(wi + 2) as f64 + err * self.s[2]) as f32;
        *w.add(wi + 3) = (*w.add(wi + 3) as f64 + err) as f32;
        let target: i32 = if bit != 0 { 65535 } else { 0 };
        const SHIFT: [u32; 3] = [5, 4, 4];
        for j in 0..3 {
            let p = self.t[j].add(self.idx[j]);
            *p = (*p as i32 + ((target - *p as i32) >> SHIFT[j])) as u16;
        }
    }
}
