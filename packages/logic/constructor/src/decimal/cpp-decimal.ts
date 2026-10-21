import type { TNumberTypeDetail } from '@falang/typescript-dto';
import type { IDecimalCodegen } from '../decimal-codegen.js';
import { variableInfoToCppType } from '../cpp-type-name.js';

/**
 * `FalangDecimal<S>` (ADR 0069 (private) §4): a template over an `int64_t` raw value, header-only, no STL — the same
 * text is inlined into `falang.cpp` and written as `falang_decimal.h`-style code for Arduino (AVR has no
 * `<string>`/`<type_traits>`). Everything is written so the Arduino sketch preprocessor (which generates prototypes
 * for free functions) has nothing to trip on: the helpers are static members of a plain struct and the operators are
 * hidden friends, so there is no free function or free function template at all. Operators exist for one scale only —
 * the compiler widens the narrower operand with an explicit `FalangDecimal<S>(x)`.
 */
export const FALANG_DECIMAL_CPP_RUNTIME = `#ifdef ARDUINO
#include <Arduino.h>
#else
#include <stdint.h>
#include <string>
#endif

struct FalangDec {
  static int64_t pow10(int n) {
    int64_t p = 1;
    while (n-- > 0) p *= 10;
    return p;
  }
  // Half away from zero.
  static int64_t divRound(int64_t n, int64_t d) {
    int64_t q = n / d;
    int64_t r = n % d;
    int64_t ar = r < 0 ? -r : r;
    int64_t ad = d < 0 ? -d : d;
    if (ar * 2 < ad) return q;
    return ((n < 0) == (d < 0)) ? q + 1 : q - 1;
  }
  static int64_t rescale(int64_t raw, int from, int to) {
    return to >= from ? raw * pow10(to - from) : divRound(raw, pow10(from - to));
  }
  static int64_t fromDouble(double v, int s) {
    double x = v * (double)pow10(s);
    return (int64_t)(x < 0 ? x - 0.5 : x + 0.5);
  }
  // \`out\` needs 24 chars.
  static void format(int64_t raw, int s, char* out) {
    char tmp[24];
    int n = 0;
    bool neg = raw < 0;
    uint64_t u = neg ? (uint64_t)0 - (uint64_t)raw : (uint64_t)raw;
    do {
      tmp[n++] = (char)('0' + (int)(u % 10));
      u /= 10;
    } while (u != 0 || n <= s);
    int len = 0;
    if (neg) out[len++] = '-';
    for (int i = n - 1; i >= 0; --i) {
      out[len++] = tmp[i];
      if (i == s && s > 0) out[len++] = '.';
    }
    out[len] = 0;
  }
};

#ifdef ARDUINO
typedef Printable FalangDecBase;  // so Serial.println(x) works
#else
struct FalangDecBase {};
#endif

template <class T> struct FalangDecIsInt { enum { v = 0 }; };
template <> struct FalangDecIsInt<signed char> { enum { v = 1 }; };
template <> struct FalangDecIsInt<unsigned char> { enum { v = 1 }; };
template <> struct FalangDecIsInt<short> { enum { v = 1 }; };
template <> struct FalangDecIsInt<unsigned short> { enum { v = 1 }; };
template <> struct FalangDecIsInt<int> { enum { v = 1 }; };
template <> struct FalangDecIsInt<unsigned int> { enum { v = 1 }; };
template <> struct FalangDecIsInt<long> { enum { v = 1 }; };
template <> struct FalangDecIsInt<unsigned long> { enum { v = 1 }; };
template <> struct FalangDecIsInt<long long> { enum { v = 1 }; };
template <> struct FalangDecIsInt<unsigned long long> { enum { v = 1 }; };
template <class T> struct FalangDecIsFloat { enum { v = 0 }; };
template <> struct FalangDecIsFloat<float> { enum { v = 1 }; };
template <> struct FalangDecIsFloat<double> { enum { v = 1 }; };
template <bool B, class T> struct FalangDecEnable {};
template <class T> struct FalangDecEnable<true, T> { typedef T type; };

template <int S> struct FalangDecimal : public FalangDecBase {
  int64_t raw;
  FalangDecimal() : raw(0) {}
  template <int T> explicit FalangDecimal(const FalangDecimal<T>& o) : raw(FalangDec::rescale(o.raw, T, S)) {}
  template <class N>
  explicit FalangDecimal(N v, typename FalangDecEnable<FalangDecIsInt<N>::v, int>::type = 0)
      : raw((int64_t)v * FalangDec::pow10(S)) {}
  template <class N>
  explicit FalangDecimal(N v, typename FalangDecEnable<FalangDecIsFloat<N>::v, long>::type = 0)
      : raw(FalangDec::fromDouble((double)v, S)) {}
  static FalangDecimal fromRaw(int64_t r) {
    FalangDecimal d;
    d.raw = r;
    return d;
  }
  int64_t toInt64() const { return raw / FalangDec::pow10(S); }
  double toDouble() const { return (double)raw / (double)FalangDec::pow10(S); }
#ifdef ARDUINO
  size_t printTo(Print& p) const {
    char b[24];
    FalangDec::format(raw, S, b);
    return p.print(b);
  }
  String str() const {
    char b[24];
    FalangDec::format(raw, S, b);
    return String(b);
  }
#else
  std::string str() const {
    char b[24];
    FalangDec::format(raw, S, b);
    return std::string(b);
  }
#endif
  FalangDecimal operator-() const { return fromRaw(-raw); }
  friend FalangDecimal operator+(FalangDecimal a, FalangDecimal b) { return fromRaw(a.raw + b.raw); }
  friend FalangDecimal operator-(FalangDecimal a, FalangDecimal b) { return fromRaw(a.raw - b.raw); }
  friend FalangDecimal operator*(FalangDecimal a, FalangDecimal b) {
    return fromRaw(FalangDec::divRound(a.raw * b.raw, FalangDec::pow10(S)));
  }
  friend FalangDecimal operator/(FalangDecimal a, FalangDecimal b) {
    return fromRaw(FalangDec::divRound(a.raw * FalangDec::pow10(S), b.raw));
  }
  friend FalangDecimal operator%(FalangDecimal a, FalangDecimal b) { return fromRaw(a.raw % b.raw); }
  friend bool operator==(FalangDecimal a, FalangDecimal b) { return a.raw == b.raw; }
  friend bool operator!=(FalangDecimal a, FalangDecimal b) { return a.raw != b.raw; }
  friend bool operator<(FalangDecimal a, FalangDecimal b) { return a.raw < b.raw; }
  friend bool operator<=(FalangDecimal a, FalangDecimal b) { return a.raw <= b.raw; }
  friend bool operator>(FalangDecimal a, FalangDecimal b) { return a.raw > b.raw; }
  friend bool operator>=(FalangDecimal a, FalangDecimal b) { return a.raw >= b.raw; }
};
`;

const intType = (to: TNumberTypeDetail): string => variableInfoToCppType({ type: 'number', numberType: to }, new Map());

export const cppDecimalCodegen: IDecimalCodegen = {
  literal: (raw, scale) => `FalangDecimal<${scale}>::fromRaw(${raw}LL)`,
  fromInteger: (code, _from, scale) => `FalangDecimal<${scale}>(${code})`,
  fromFloat: (code, scale) => `FalangDecimal<${scale}>(${code})`,
  rescale: (code, _from, to) => `FalangDecimal<${to}>(${code})`,
  toInteger: (code, _scale, to) => `static_cast<${intType(to)}>((${code}).toInt64())`,
  toFloat: (code, _scale, to) => `static_cast<${intType(to)}>((${code}).toDouble())`,
  arithmetic: (operator, left, right) => `(${left} ${operator} ${right})`,
  print: (code) => `(${code}).str()`,
};
