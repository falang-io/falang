import type { IDecimalCodegen } from '../decimal-codegen.js';
import { variableInfoToRustType } from '../rust-type-name.js';

/** `falang_decimal.rs` — `core` only, so it works under `#![no_std]` (ADR 0069 (private) §4). Paths, not `use core::…`: a `use` path is crate-root-relative in the 2015 edition the test harness compiles with. */
export const FALANG_DECIMAL_RUST_MODULE = `pub const fn falang_dec_pow10(n: u32) -> i64 {
    let mut p: i64 = 1;
    let mut i = 0;
    while i < n {
        p *= 10;
        i += 1;
    }
    p
}

// Half away from zero.
pub fn falang_dec_div_round(n: i64, d: i64) -> i64 {
    let q = n / d;
    let r = (n % d).abs();
    if r * 2 < d.abs() {
        q
    } else if (n < 0) == (d < 0) {
        q + 1
    } else {
        q - 1
    }
}

/// A fixed-point number: \`raw × 10^-S\`.
#[derive(Clone, Copy, Default, PartialEq, PartialOrd, Debug)]
pub struct FalangDecimal<const S: u32> {
    pub raw: i64,
}

impl<const S: u32> FalangDecimal<S> {
    pub fn from_raw(raw: i64) -> Self {
        Self { raw }
    }
    pub fn from_int(value: i64) -> Self {
        Self { raw: value * falang_dec_pow10(S) }
    }
    pub fn from_float(value: f64) -> Self {
        let x = value * falang_dec_pow10(S) as f64;
        Self { raw: (if x < 0.0 { x - 0.5 } else { x + 0.5 }) as i64 }
    }
    pub fn rescale<const T: u32>(self) -> FalangDecimal<T> {
        if T >= S {
            FalangDecimal::<T> { raw: self.raw * falang_dec_pow10(T - S) }
        } else {
            FalangDecimal::<T> { raw: falang_dec_div_round(self.raw, falang_dec_pow10(S - T)) }
        }
    }
    pub fn to_i64(self) -> i64 {
        self.raw / falang_dec_pow10(S)
    }
    pub fn to_f64(self) -> f64 {
        self.raw as f64 / falang_dec_pow10(S) as f64
    }
}

impl<const S: u32> core::ops::Add for FalangDecimal<S> {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self { raw: self.raw + rhs.raw }
    }
}
impl<const S: u32> core::ops::Sub for FalangDecimal<S> {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self { raw: self.raw - rhs.raw }
    }
}
impl<const S: u32> core::ops::Mul for FalangDecimal<S> {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Self { raw: falang_dec_div_round(self.raw * rhs.raw, falang_dec_pow10(S)) }
    }
}
impl<const S: u32> core::ops::Div for FalangDecimal<S> {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        Self { raw: falang_dec_div_round(self.raw * falang_dec_pow10(S), rhs.raw) }
    }
}
impl<const S: u32> core::ops::Rem for FalangDecimal<S> {
    type Output = Self;
    fn rem(self, rhs: Self) -> Self {
        Self { raw: self.raw % rhs.raw }
    }
}
impl<const S: u32> core::ops::Neg for FalangDecimal<S> {
    type Output = Self;
    fn neg(self) -> Self {
        Self { raw: -self.raw }
    }
}

impl<const S: u32> core::fmt::Display for FalangDecimal<S> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let p = falang_dec_pow10(S) as u64;
        let u = self.raw.unsigned_abs();
        if self.raw < 0 {
            f.write_str("-")?;
        }
        if S == 0 {
            core::write!(f, "{}", u)
        } else {
            core::write!(f, "{}.{:0width$}", u / p, u % p, width = S as usize)
        }
    }
}
`;

export const RUST_DECIMAL_USE = 'use crate::falang::falang_decimal::FalangDecimal;';
export const RUST_DECIMAL_MODULE_NAME = 'falang_decimal';

const rustType = (to: Parameters<IDecimalCodegen['toInteger']>[2]): string =>
  variableInfoToRustType({ type: 'number', numberType: to }, new Map());

export const rustDecimalCodegen: IDecimalCodegen = {
  literal: (raw, scale) => `FalangDecimal::<${scale}>::from_raw(${raw})`,
  fromInteger: (code, _from, scale) => `FalangDecimal::<${scale}>::from_int((${code}) as i64)`,
  fromFloat: (code, scale) => `FalangDecimal::<${scale}>::from_float((${code}) as f64)`,
  rescale: (code, _from, to) => `(${code}).rescale::<${to}>()`,
  toInteger: (code, _scale, to) => `((${code}).to_i64() as ${rustType(to)})`,
  toFloat: (code, _scale, to) => `((${code}).to_f64() as ${rustType(to)})`,
  arithmetic: (operator, left, right) => `(${left} ${operator} ${right})`,
  print: (code) => code,
};
