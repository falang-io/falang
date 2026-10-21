import type { IDecimalCodegen } from '../decimal-codegen.js';
import { decimalPow10 } from '../decimal-literal.js';
import { variableInfoToGoType } from '../golang-type-name.js';

/**
 * A Go decimal is its `int64` raw value (ADR 0069 (private) §4) — the scale is known statically, so no type is
 * needed beyond `int64`. No imports: the generated file only imports what its own text mentions.
 */
export const FALANG_DECIMAL_GO_RUNTIME = `func falangDecPow10(n int) int64 {
\tp := int64(1)
\tfor i := 0; i < n; i++ {
\t\tp *= 10
\t}
\treturn p
}

// Half away from zero.
func falangDecDivRound(n int64, d int64) int64 {
\tq := n / d
\tr := n % d
\tif r < 0 {
\t\tr = -r
\t}
\tad := d
\tif ad < 0 {
\t\tad = -ad
\t}
\tif r*2 < ad {
\t\treturn q
\t}
\tif (n < 0) == (d < 0) {
\t\treturn q + 1
\t}
\treturn q - 1
}

func falangDecRescale(raw int64, from int, to int) int64 {
\tif to >= from {
\t\treturn raw * falangDecPow10(to-from)
\t}
\treturn falangDecDivRound(raw, falangDecPow10(from-to))
}

func falangDecMul(a int64, b int64, s int) int64 {
\treturn falangDecDivRound(a*b, falangDecPow10(s))
}

func falangDecDiv(a int64, b int64, s int) int64 {
\treturn falangDecDivRound(a*falangDecPow10(s), b)
}

func falangDecFromFloat(v float64, s int) int64 {
\tx := v * float64(falangDecPow10(s))
\tif x < 0 {
\t\treturn int64(x - 0.5)
\t}
\treturn int64(x + 0.5)
}

func falangDecStr(raw int64, s int) string {
\tneg := raw < 0
\tu := uint64(raw)
\tif neg {
\t\tu = -u
\t}
\tdigits := []byte{}
\tfor u != 0 || len(digits) <= s {
\t\tdigits = append(digits, byte('0'+u%10))
\t\tu /= 10
\t}
\tout := []byte{}
\tif neg {
\t\tout = append(out, '-')
\t}
\tfor i := len(digits) - 1; i >= 0; i-- {
\t\tout = append(out, digits[i])
\t\tif i == s && s > 0 {
\t\t\tout = append(out, '.')
\t\t}
\t}
\treturn string(out)
}`;

const goType = (to: Parameters<IDecimalCodegen['toInteger']>[2]): string =>
  variableInfoToGoType({ type: 'number', numberType: to }, new Map());

export const goDecimalCodegen: IDecimalCodegen = {
  literal: (raw) => `int64(${raw})`,
  fromInteger: (code, _from, scale) => (scale === 0 ? `int64(${code})` : `(int64(${code}) * ${decimalPow10(scale)})`),
  fromFloat: (code, scale) => `falangDecFromFloat(float64(${code}), ${scale})`,
  rescale: (code, from, to) =>
    to >= from ? `(${code} * ${decimalPow10(to - from)})` : `falangDecRescale(${code}, ${from}, ${to})`,
  toInteger: (code, scale, to) => `${goType(to)}(${scale === 0 ? code : `${code} / ${decimalPow10(scale)}`})`,
  toFloat: (code, scale, to) =>
    `${goType(to)}(${scale === 0 ? `float64(${code})` : `float64(${code}) / ${decimalPow10(scale)}.0`})`,
  arithmetic: (operator, left, right, scale) => {
    if (operator === '*') return `falangDecMul(${left}, ${right}, ${scale})`;
    if (operator === '/') return `falangDecDiv(${left}, ${right}, ${scale})`;
    return `(${left} ${operator} ${right})`;
  },
  print: (code, scale) => `falangDecStr(${code}, ${scale})`,
};
