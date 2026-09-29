import { action, zod, type IDataInfo, type INodeConfig } from '@falang/dto';
import {
  DELAY,
  DELAY_MICROSECONDS,
  MICROS,
  MILLIS,
  RANDOM,
  RANDOM_SEED,
  SERIAL_BEGIN,
  SERIAL_PRINT,
  SERIAL_PRINTLN,
  type IRandomData,
  type ISingleNumberActionData,
  type IZeroArgReadData,
} from './arduino-function-nodes.js';

const nonNegativeIntZod = zod.object({ value: zod.number().int().min(0) });
const anyNumberZod = zod.object({ value: zod.number() });
const zeroArgReadZod = zod.object({ variable: zod.string() });
const randomZod = zod.object({ max: zod.number().int().min(1), variable: zod.string() });

const nonNegativeIntDataType = (value: number): IDataInfo<typeof nonNegativeIntZod> => ({
  type: nonNegativeIntZod,
  default: (): ISingleNumberActionData => ({ value }),
});

const anyNumberDataType = (value: number): IDataInfo<typeof anyNumberZod> => ({
  type: anyNumberZod,
  default: (): ISingleNumberActionData => ({ value }),
});

const zeroArgReadDataType = (variable: string): IDataInfo<typeof zeroArgReadZod> => ({
  type: zeroArgReadZod,
  default: (): IZeroArgReadData => ({ variable }),
});

const randomDataType: IDataInfo<typeof randomZod> = {
  type: randomZod,
  default: (): IRandomData => ({ max: 100, variable: 'randomValue' }),
};

/** One `action()`-built `INodeConfig` per Arduino built-in-function node kind — assembled into a `NodesGroup` by `arduino-functions-icons-group.ts`. */
export const arduinoFunctionNodeConfigs: readonly INodeConfig[] = [
  action(DELAY, nonNegativeIntDataType(1000)),
  action(DELAY_MICROSECONDS, nonNegativeIntDataType(100)),
  action(RANDOM_SEED, anyNumberDataType(0)),
  action(SERIAL_BEGIN, nonNegativeIntDataType(9600)),
  action(SERIAL_PRINT, anyNumberDataType(0)),
  action(SERIAL_PRINTLN, anyNumberDataType(0)),
  action(MILLIS, zeroArgReadDataType('currentMillis')),
  action(MICROS, zeroArgReadDataType('currentMicros')),
  action(RANDOM, randomDataType),
];
