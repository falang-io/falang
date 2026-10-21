import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  action,
  arrPush,
  arrUnshift,
  callFunction,
  createVar,
  foreach,
  functionDocument,
  log,
  objectsStructureDocument,
  structureThread,
} from './arrays-project-builders.js';

/**
 * The `decimals` project (ADR 0069 (private) §4): `decimal(D, S)` variables of several scales, exact literals,
 * promotion to the larger scale, `*` `/` `%` rounded half away from zero, stores that rescale (also the
 * double-rounding case: a product is rounded to the larger operand scale first, then to the target), comparisons,
 * decimal <-> integer / float conversions, an array and a struct of decimals, decimal arguments and results, compound
 * assignments, printing with exactly `S` fraction digits (negative and zero values included) and `S = 0`. Every
 * expected line is computed by hand from the contract below and must be identical in every target
 * (`DECIMALS_EXPECTED_RESULT_LINES`). Floats only appear with exactly representable values (2.5, 19.5, 48.75), since
 * a float -> decimal conversion of an inexact float is deliberately outside the contract.
 */

const decimal = (digits: number, decimals: number): TVariableInfo => ({
  type: 'number',
  numberType: { type: 'decimal', digits, decimals },
});
const int32: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const float64: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

const dec2 = decimal(10, 2);
const dec3 = decimal(10, 3);

const PRICES_THREAD_ID = 'thread-prices';
const pricesType: TVariableInfo = { type: 'struct', id: PRICES_THREAD_ID };
const decimalArrayType: TVariableInfo = { type: 'array', elementType: dec2, dimensions: 1 };

const DOC = {
  structs: 'doc-decimals-structs',
  discount: 'doc-decimals-discount',
  third: 'doc-decimals-third',
  toInt: 'doc-decimals-to-int',
  fromInt: 'doc-decimals-from-int',
  main: 'doc-decimals-main',
} as const;

export const DECIMALS_MAIN_DOCUMENT_ID = DOC.main;

/** `if (condition) log("<label>=yes") else log("<label>=no")` — a boolean is printed differently by every target, a word is not. */
const check = (id: string, label: string, condition: string): INode => ({
  id,
  name: 'if',
  data: condition,
  children: [
    { id: `${id}-then`, name: 'if-child', children: [log(`${id}-yes`, `${label}=yes`)] },
    { id: `${id}-else`, name: 'if-child', children: [log(`${id}-no`, `${label}=no`)] },
  ],
});

export const DECIMALS_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  objectsStructureDocument(DOC.structs, 'DecimalStructs', [
    structureThread(PRICES_THREAD_ID, 'Prices', [
      { name: 'price', variableType: dec2 },
      { name: 'rate', variableType: decimal(6, 3) },
      { name: 'qty', variableType: int32 },
    ]),
  ]),
  functionDocument({
    documentId: DOC.discount,
    name: 'Discount',
    parameters: [
      { name: 'x', type: dec2 },
      { name: 'pct', type: int32 },
    ],
    returnValue: dec2,
    body: [{ id: 'discount-r', name: 'return', data: 'x - x * pct / 100' }],
  }),
  functionDocument({
    documentId: DOC.third,
    name: 'Third',
    parameters: [{ name: 'x', type: dec2 }],
    returnValue: dec2,
    body: [{ id: 'third-r', name: 'return', data: 'x / 3' }],
  }),
  functionDocument({
    documentId: DOC.toInt,
    name: 'ToInt',
    parameters: [{ name: 'x', type: dec2 }],
    returnValue: int32,
    body: [{ id: 'to-int-r', name: 'return', data: 'x' }],
  }),
  functionDocument({
    documentId: DOC.fromInt,
    name: 'FromInt',
    parameters: [{ name: 'n', type: int32 }],
    returnValue: dec2,
    body: [{ id: 'from-int-r', name: 'return', data: 'n' }],
  }),
  functionDocument({
    documentId: DOC.main,
    name: 'main',
    body: [
      // 1. declarations with exact literals, a negative value, scale 0
      createVar('v1', 'p', dec2, '19.99'),
      createVar('v2', 'r', decimal(6, 3), '0.075'),
      createVar('v3', 'q', int32, '3'),
      createVar('v4', 'z', decimal(5, 0), '7'),
      createVar('v5', 'n', decimal(8, 2), '-0.05'),
      log('l1', 'p=${p} r=${r} z=${z} n=${n}'),
      // 2. promotion to the larger scale; a product stored into a narrower variable rounds twice
      createVar('t1', 't1', dec2, 'p * q'),
      createVar('t2', 't2', dec2, 'p * r'),
      createVar('t3', 't3', dec3, 'p * r'),
      createVar('t4', 't4', dec2, 't1 + t2'),
      createVar('t5', 't5', dec3, 'p + r'),
      log('l2', 't1=${t1} t2=${t2} t3=${t3} t4=${t4} t5=${t5}'),
      createVar('t6', 't6', dec2, 'p - t1 * 2 + 0.01'),
      log('l3', 't6=${t6} neg=${-t6}'),
      // 3. rounding half away from zero (literals and variables, both signs)
      createVar('h1', 'h1', dec3, '1.005'),
      createVar('h2', 'h2', dec2, 'h1 * 1'),
      createVar('h3', 'h3', decimal(10, 0), '-2.5'),
      createVar('h4', 'h4', dec2, '0.125'),
      createVar('h5', 'h5', dec2, '-0.125'),
      createVar('h6', 'h6', dec3, '2.675'),
      createVar('h7', 'h7', dec2, 'h6'),
      createVar('h8', 'h8', dec2, '-h6'),
      log('l4', 'h2=${h2} h3=${h3} h4=${h4} h5=${h5} h7=${h7} h8=${h8}'),
      // 4. division and remainder
      createVar('d1', 'd1', dec2, 'p / q'),
      createVar('u1', 'u', dec3, '1'),
      createVar('d2', 'd2', dec3, 'u / 8'),
      createVar('u2', 'u2', dec2, '2'),
      createVar('d3', 'd3', dec2, 'u2 / q'),
      createVar('d4', 'd4', dec2, '-u2 / q'),
      createVar('d5', 'd5', dec2, 'p % 5'),
      createVar('d6', 'd6', dec2, '-p % 5'),
      log('l5', 'd1=${d1} d2=${d2} d3=${d3} d4=${d4} d5=${d5} d6=${d6}'),
      // 5. exact comparisons
      check('c1', 'c1', 'p > 19.98'),
      check('c2', 'c2', 'p == 19.99'),
      check('c3', 'c3', 'p < r'),
      check('c4', 'c4', 't1 >= t2'),
      check('c5', 'c5', 'n != 0'),
      check('c6', 'c6', 'h6 == 2.675'),
      check('c7', 'c7', 'r < 0.08'),
      // 6. decimal <-> integer / float
      createVar('i1', 'i1', int32, 'p'),
      createVar('i2', 'i2', int32, 'n'),
      createVar('i3', 'i3', int32, '-p'),
      createVar('i4', 'i4', int32, 't6'),
      createVar('f1', 'fl', float64, '2.5'),
      createVar('x1', 'x1', dec2, 'fl * 3'),
      createVar('f2', 'p2', dec2, '19.5'),
      createVar('f3', 'm', float64, 'p2 * fl'),
      log('l6', 'i1=${i1} i2=${i2} i3=${i3} i4=${i4} x1=${x1} m=${m} floor=${Math.floor(p)}'),
      // 7. an array of decimals (a literal, a variable and a wider decimal are all stored at the element scale)
      createVar('a1', 'arr', decimalArrayType),
      arrPush('a2', 'arr', '1.5'),
      arrPush('a3', 'arr', '2.25'),
      arrPush('a4', 'arr', 'p'),
      arrPush('a5', 'arr', 'h6'),
      arrUnshift('a6', 'arr', '0.5'),
      createVar('a7', 'total', dec2, '0'),
      foreach('a8', 'arr', 'item', [action('a9', 'total = total + item')]),
      log('l7', 'total=${total} second=${arr[1]} count=${arr.length}'),
      // 8. a struct of decimals
      createVar('s1', 'ctr', pricesType),
      action('s2', 'ctr.price = 4.5'),
      action('s3', 'ctr.rate = ctr.price * 0.01'),
      action('s4', 'ctr.qty = 2'),
      action('s5', 'ctr.price += 0.005'),
      action('s6', 'ctr.rate *= ctr.qty'),
      log('l8', 'price=${ctr.price} rate=${ctr.rate} qty=${ctr.qty}'),
      // 9. decimal arguments and results
      callFunction('k1', DOC.discount, ['p', '10'], 'disc'),
      callFunction('k2', DOC.third, ['100'], 'third'),
      callFunction('k3', DOC.third, ['fl'], 'third2'),
      callFunction('k4', DOC.toInt, ['p'], 'toInt'),
      callFunction('k5', DOC.fromInt, ['7'], 'fromInt'),
      log('l9', 'disc=${disc} third=${third} third2=${third2} toInt=${toInt} fromInt=${fromInt}'),
      // 10. a wide scale, and scale 0
      createVar('b1', 'b1', decimal(18, 6), '123456.789012'),
      createVar('b2', 'b2', decimal(18, 6), 'b1 * 2'),
      log('l10', 'big=${b1 * 2} b2=${b2} z1=${z + 1} z2=${z / 2}'),
      // 11. compound assignments
      createVar('o1', 'acc', dec2, '19.99'),
      action('o2', 'acc += 1'),
      action('o3', 'acc *= 2'),
      action('o4', 'acc /= 4'),
      action('o5', 'acc -= 0.255'),
      log('l11', 'acc=${acc}'),
    ],
  }),
];

/**
 * By hand (raw = value x 10^S, half away from zero):
 * 1. 19.99 0.075 7 -0.05.
 * 2. t1 = 1999 x 3 = 59.97; p x r at scale 3 = 19990 x 75 / 1000 = 1499.25 -> 1499 = 1.499 (t3), stored at scale 2:
 *    149.9 -> 150 = 1.50 (t2); t4 = 59.97 + 1.50 = 61.47; t5 = 19.990 + 0.075 = 20.065;
 *    t6 = 19.99 - 119.94 + 0.01 = -99.94.
 * 3. 1.005 -> 1.01; -2.5 -> -3; 0.125 -> 0.13; -0.125 -> -0.13; 2.675 -> 2.68; -2.675 -> -2.68.
 * 4. 1999 x 100 / 300 = 666.33 -> 6.66; 1000 x 1000 / 8000 = 125 -> 0.125; 200 x 100 / 300 = 66.67 -> 0.67 (and -0.67);
 *    1999 % 500 = 499 -> 4.99 (and -4.99, the remainder keeps the sign of the dividend).
 * 5. 19.99 > 19.98, 19.99 == 19.99, not 19.99 < 0.075, 59.97 >= 1.50, -0.05 != 0, 2.675 == 2.675, 0.075 < 0.08.
 * 6. 19, 0 (-0.05 truncates), -19, -99; 2.5 x 3 = 7.5 -> 7.50; 19.5 x 2.5 = 48.75; floor(19.99) = 19.
 * 7. [0.50, 1.50, 2.25, 19.99, 2.68]: sum 26.92, second 1.50, 5 items.
 * 8. price 4.50; rate = 4.50 x 0.01 = 0.045 -> 0.05 at scale 2 -> 0.050; price + 0.005 = 4.505 -> 4.51;
 *    rate x 2 = 0.100.
 * 9. Discount: 19.99 x 10 = 199.90, / 100 = 1.999 -> 2.00, 19.99 - 2.00 = 17.99; 100.00 / 3 = 33.33;
 *    2.50 / 3 = 0.8333 -> 0.83; ToInt(19.99) = 19; FromInt(7) = 7.00.
 * 10. 123456.789012 x 2 = 246913.578024; 7 + 1 = 8; 7 / 2 = 3.5 -> 4.
 * 11. 19.99 + 1 = 20.99; x 2 = 41.98; / 4 = 10.495 -> 10.50; - 0.255 = 10.245 -> 10.25.
 */
export const DECIMALS_EXPECTED_RESULT_LINES = [
  'p=19.99 r=0.075 z=7 n=-0.05',
  't1=59.97 t2=1.50 t3=1.499 t4=61.47 t5=20.065',
  't6=-99.94 neg=99.94',
  'h2=1.01 h3=-3 h4=0.13 h5=-0.13 h7=2.68 h8=-2.68',
  'd1=6.66 d2=0.125 d3=0.67 d4=-0.67 d5=4.99 d6=-4.99',
  'c1=yes',
  'c2=yes',
  'c3=no',
  'c4=yes',
  'c5=yes',
  'c6=yes',
  'c7=yes',
  'i1=19 i2=0 i3=-19 i4=-99 x1=7.50 m=48.75 floor=19',
  'total=26.92 second=1.50 count=5',
  'price=4.51 rate=0.100 qty=2',
  'disc=17.99 third=33.33 third2=0.83 toInt=19 fromInt=7.00',
  'big=246913.578024 b2=246913.578024 z1=8 z2=4',
  'acc=10.25',
];
