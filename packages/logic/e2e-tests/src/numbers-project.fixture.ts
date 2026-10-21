import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  action,
  arrPush,
  callFunction,
  createVar,
  foreach,
  functionDocument,
  log,
  objectsStructureDocument,
  structureThread,
} from './arrays-project-builders.js';

/**
 * The `numbers` project (ADR 0069 (private) §2/§3, integer part): variables of every integer width (signed and
 * unsigned), arithmetic that promotes across widths, integer division and remainder (including negative operands), a
 * float stored into an integer, a struct with unsigned fields and a `uint8` array. Printed through `log`, so 8-bit
 * values must print as numbers in every target. Values are chosen so no step overflows (overflow differs between
 * targets and is deliberately outside the contract), and a signed/unsigned mix never needs a negative result in an
 * unsigned width. One expected output for every target (`NUMBERS_EXPECTED_RESULT_LINES`).
 */

const integer = (integerType: 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64') =>
  ({ type: 'number', numberType: { type: 'integer', integerType } }) as TVariableInfo;

const int8 = integer('int8');
const uint8 = integer('uint8');
const int16 = integer('int16');
const uint16 = integer('uint16');
const int32 = integer('int32');
const uint32 = integer('uint32');
const int64 = integer('int64');
const uint64 = integer('uint64');
const float64: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };
const float32: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };

const COUNTERS_THREAD_ID = 'thread-counters';
const countersType: TVariableInfo = { type: 'struct', id: COUNTERS_THREAD_ID };
const uint8ArrayType: TVariableInfo = { type: 'array', elementType: uint8, dimensions: 1 };

const DOC = {
  structs: 'doc-numbers-structs',
  half: 'doc-numbers-half',
  mix: 'doc-numbers-mix',
  main: 'doc-numbers-main',
} as const;

export const NUMBERS_MAIN_DOCUMENT_ID = DOC.main;

export const NUMBERS_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  objectsStructureDocument(DOC.structs, 'NumberStructs', [
    structureThread(COUNTERS_THREAD_ID, 'Counters', [
      { name: 'small', variableType: uint8 },
      { name: 'big', variableType: uint64 },
      { name: 'delta', variableType: int16 },
    ]),
  ]),
  functionDocument({
    documentId: DOC.half,
    name: 'Half',
    parameters: [{ name: 'x', type: int32 }],
    returnValue: int32,
    body: [{ id: 'half-r', name: 'return', data: 'x / 2' }],
  }),
  functionDocument({
    documentId: DOC.mix,
    name: 'Mix',
    parameters: [
      { name: 'a', type: uint8 },
      { name: 'b', type: uint16 },
    ],
    returnValue: uint16,
    body: [{ id: 'mix-r', name: 'return', data: 'a + b' }],
  }),
  functionDocument({
    documentId: DOC.main,
    name: 'main',
    body: [
      // 1. every width
      createVar('v1', 'a', int8, '100'),
      createVar('v2', 'b', uint8, '200'),
      createVar('v3', 'c', int16, '-300'),
      createVar('v4', 'd', uint16, '60000'),
      createVar('v5', 'e', int32, '-70000'),
      createVar('v6', 'f', uint32, '4000000000'),
      createVar('v7', 'g', int64, '-5000000000'),
      createVar('v8', 'h', uint64, '10000000000'),
      log('l1', 'a=${a} b=${b} c=${c} d=${d} e=${e} f=${f} g=${g} h=${h}'),
      // 2. promotion across widths
      createVar('p1', 's1', int32, 'a + c'),
      createVar('p2', 's2', uint32, 'b + d'),
      createVar('p3', 's3', int64, 'e + g'),
      createVar('p4', 's4', uint64, 'f + h'),
      createVar('p5', 's5', int32, 'e * 2'),
      log('l2', 's1=${s1} s2=${s2} s3=${s3} s4=${s4} s5=${s5}'),
      // 3. integer division and remainder (truncation toward zero, sign of the dividend)
      log('l3', 'e/300=${e / 300} e%300=${e % 300} c/7=${c / 7} c%7=${c % 7}'),
      log('l4', 'd/7=${d / 7} d%7=${d % 7} g/3=${g / 3} g%3=${g % 3} h/7=${h / 7} h%7=${h % 7}'),
      // 4. a float stored into an integer truncates toward zero
      createVar('f1', 'fl', float64, '7.9'),
      createVar('f2', 'fl2', float32, '-2.5'),
      createVar('f3', 'i1', int32, 'fl'),
      createVar('f4', 'i2', int32, 'fl2 * 3'),
      log('l5', 'i1=${i1} i2=${i2}'),
      action('f5', 'i1 = fl * 2'),
      log('l6', 'i1=${i1}'),
      // 5. narrow widths
      createVar('n1', 'n1', uint8, '250'),
      createVar('n2', 'n2', uint8, 'n1 - 50'),
      createVar('n3', 'n3', int8, '-100'),
      createVar('n4', 'n4', int8, 'n3 + 50'),
      action('n5', 'n1 = n1 - 100'),
      createVar('n6', 'n6', uint8, 'n1 / 4'),
      log('l7', 'n1=${n1} n2=${n2} n3=${n3} n4=${n4} n6=${n6}'),
      // 6. a struct with unsigned fields
      createVar('s1c', 'ctr', countersType),
      action('s2c', 'ctr.small = 255'),
      action('s3c', 'ctr.big = 9000000000000000000'),
      action('s4c', 'ctr.delta = -12345'),
      action('s5c', 'ctr.small = ctr.small - 5'),
      log('l8', 'small=${ctr.small} big=${ctr.big} delta=${ctr.delta}'),
      // 7. a uint8 array
      createVar('a1', 'arr', uint8ArrayType),
      arrPush('a2', 'arr', '10'),
      arrPush('a3', 'arr', '20'),
      arrPush('a4', 'arr', '30'),
      createVar('a5', 'total', uint32, '0'),
      foreach('a6', 'arr', 'item', [action('a7', 'total = total + item')]),
      log('l9', 'total=${total} second=${arr[1]} count=${arr.length}'),
      // 8. calls
      callFunction('c1', DOC.half, ['-7'], 'half'),
      callFunction('c2', DOC.mix, ['200', '1000'], 'mixed'),
      log('l10', 'half=${half} mixed=${mixed}'),
      // 9. increment / decrement / compound-assignment statements (lowered to `x = x + 1` outside TS)
      action('i1x', 'e++'),
      action('i2x', '--n1'),
      action('i3x', 'ctr.small--'),
      action('i4x', 'arr[0]++'),
      action('i5x', 'total += 5'),
      action('i6x', 'n6 *= 2'),
      log('l11', 'e=${e} n1=${n1} small=${ctr.small} arr0=${arr[0]} total=${total} n6=${n6}'),
    ],
  }),
];

/**
 * By hand, with C semantics: 100+(-300) = -200; 200+60000 = 60200; -70000+(-5000000000) = -5000070000;
 * 4000000000+10000000000 = 14000000000; -70000*2 = -140000. -70000/300 = -233 (rem -100); -300/7 = -42 (rem -6);
 * 60000/7 = 8571 (rem 3); -5000000000/3 = -1666666666 (rem -2); 10000000000/7 = 1428571428 (rem 4). 7.9 -> 7,
 * -2.5*3 = -7.5 -> -7, 7.9*2 = 15.8 -> 15. 250-50 = 200, -100+50 = -50, 250-100 = 150, 150/4 = 37. 255-5 = 250.
 * 10+20+30 = 60. -7/2 = -3. 200+1000 = 1200. -70000+1 = -69999, 150-1 = 149, 250-1 = 249, 10+1 = 11, 60+5 = 65, 37*2 = 74.
 */
export const NUMBERS_EXPECTED_RESULT_LINES = [
  'a=100 b=200 c=-300 d=60000 e=-70000 f=4000000000 g=-5000000000 h=10000000000',
  's1=-200 s2=60200 s3=-5000070000 s4=14000000000 s5=-140000',
  'e/300=-233 e%300=-100 c/7=-42 c%7=-6',
  'd/7=8571 d%7=3 g/3=-1666666666 g%3=-2 h/7=1428571428 h%7=4',
  'i1=7 i2=-7',
  'i1=15',
  'n1=150 n2=200 n3=-100 n4=-50 n6=37',
  'small=250 big=9000000000000000000 delta=-12345',
  'total=60 second=20 count=3',
  'half=-3 mixed=1200',
  'e=-69999 n1=149 small=249 arr0=11 total=65 n6=74',
];
