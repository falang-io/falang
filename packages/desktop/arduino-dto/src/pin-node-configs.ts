import { action, zod, type IDataInfo, type INodeConfig } from '@falang/dto';
import {
  PIN_READ_ANALOG,
  PIN_READ_DIGITAL,
  PIN_WRITE_ANALOG,
  PIN_WRITE_DIGITAL,
  type IPinReadData,
  type IPinWriteAnalogData,
  type IPinWriteDigitalData,
} from './pin-nodes.js';

const pinWriteDigitalZod = zod.object({ pin: zod.number().int().min(0), value: zod.boolean() });
const pinWriteAnalogZod = zod.object({ pin: zod.number().int().min(0), value: zod.number().int().min(0).max(255) });
const pinReadZod = zod.object({ pin: zod.number().int().min(0), variable: zod.string() });

const pinWriteDigitalDataType: IDataInfo<typeof pinWriteDigitalZod> = {
  type: pinWriteDigitalZod,
  default: (): IPinWriteDigitalData => ({ pin: 13, value: false }),
};

const pinWriteAnalogDataType: IDataInfo<typeof pinWriteAnalogZod> = {
  type: pinWriteAnalogZod,
  default: (): IPinWriteAnalogData => ({ pin: 9, value: 0 }),
};

const pinReadDigitalDataType: IDataInfo<typeof pinReadZod> = {
  type: pinReadZod,
  default: (): IPinReadData => ({ pin: 2, variable: 'buttonState' }),
};

const pinReadAnalogDataType: IDataInfo<typeof pinReadZod> = {
  type: pinReadZod,
  default: (): IPinReadData => ({ pin: 0, variable: 'sensorValue' }),
};

/** One `action()`-built `INodeConfig` per pin node kind — assembled into a `NodesGroup` by `pin-nodes-icons-group.ts`. */
export const pinNodeConfigs: readonly INodeConfig[] = [
  action(PIN_WRITE_DIGITAL, pinWriteDigitalDataType),
  action(PIN_WRITE_ANALOG, pinWriteAnalogDataType),
  action(PIN_READ_DIGITAL, pinReadDigitalDataType),
  action(PIN_READ_ANALOG, pinReadAnalogDataType),
];
