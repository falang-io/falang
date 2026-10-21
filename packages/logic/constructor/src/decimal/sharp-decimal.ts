import type { IDecimalCodegen } from '../decimal-codegen.js';
import { formatDecimalText } from '../decimal-literal.js';
import { variableInfoToSharpType } from '../sharp-type-name.js';

/** C# uses its native `decimal`; every `*`, `/` and every store is rounded half away from zero (ADR 0069 (private) §4). */
export const FALANG_DECIMAL_SHARP_RUNTIME = `public static class FalangDec {
    public static decimal Round(decimal value, int scale) {
        return System.Math.Round(value, scale, System.MidpointRounding.AwayFromZero);
    }

    public static decimal FromDouble(double value, int scale) {
        decimal unit = 1m;
        for (int i = 0; i < scale; i++) unit *= 10m;
        double x = value * (double)unit;
        long raw = (long)(x < 0 ? x - 0.5 : x + 0.5);
        return (decimal)raw / unit;
    }

    public static string Str(decimal value, int scale) {
        return value.ToString("F" + scale, System.Globalization.CultureInfo.InvariantCulture);
    }
}`;

const sharpType = (to: Parameters<IDecimalCodegen['toInteger']>[2]): string =>
  variableInfoToSharpType({ type: 'number', numberType: to }, new Map());

export const sharpDecimalCodegen: IDecimalCodegen = {
  literal: (raw, scale) => (raw < 0n ? `(${formatDecimalText(raw, scale)}m)` : `${formatDecimalText(raw, scale)}m`),
  fromInteger: (code) => `((decimal)(${code}))`,
  fromFloat: (code, scale) => `FalangDec.FromDouble(${code}, ${scale})`,
  rescale: (code, from, to) => (to >= from ? code : `FalangDec.Round(${code}, ${to})`),
  toInteger: (code, _scale, to) => `((${sharpType(to)})(${code}))`,
  toFloat: (code, _scale, to) => `((${sharpType(to)})(${code}))`,
  arithmetic: (operator, left, right, scale) => {
    if (operator === '*' || operator === '/') return `FalangDec.Round(${left} ${operator} ${right}, ${scale})`;
    return `(${left} ${operator} ${right})`;
  },
  print: (code, scale) => `FalangDec.Str(${code}, ${scale})`,
};
