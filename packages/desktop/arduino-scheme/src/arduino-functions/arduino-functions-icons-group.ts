import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
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
} from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
import { nodeTitleKey } from '../locales/arduino-t.js';
import { arduinoFunctionNodeConfigs } from './arduino-function-node-configs.js';
import { createSingleNumberActionBlockConfig } from './single-number-action.block.js';
import { createZeroArgReadBlockConfig } from './zero-arg-read.block.js';
import { randomBlockConfig } from './random.block.js';

/**
 * Passed as `extraIconsGroups` to `@falang/typescript-scheme`'s `functionalSchemeFactory` (see
 * ADR 0023 (private)), alongside `pinNodesIconsGroup` — same seam, one more group of Arduino
 * built-in functions (delays, timers, `random`/`randomSeed`, `Serial`) that don't involve a pin.
 */
export const arduinoFunctionsIconsGroup = new IconsGroup(new NodesGroup(arduinoFunctionNodeConfigs), {
  [DELAY]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'delay-ms', min: 0 }),
    nodeTitleKey(DELAY),
  ),
  [DELAY_MICROSECONDS]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'delay-us', min: 0 }),
    nodeTitleKey(DELAY_MICROSECONDS),
  ),
  [RANDOM_SEED]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'seed' }),
    nodeTitleKey(RANDOM_SEED),
  ),
  [SERIAL_BEGIN]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'baud', min: 0 }),
    nodeTitleKey(SERIAL_BEGIN),
  ),
  [SERIAL_PRINT]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'value' }),
    nodeTitleKey(SERIAL_PRINT),
  ),
  [SERIAL_PRINTLN]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ labelKey: 'value' }),
    nodeTitleKey(SERIAL_PRINTLN),
  ),
  [MILLIS]: getSimpleIconNodeConfig(createZeroArgReadBlockConfig('millis()'), nodeTitleKey(MILLIS)),
  [MICROS]: getSimpleIconNodeConfig(createZeroArgReadBlockConfig('micros()'), nodeTitleKey(MICROS)),
  [RANDOM]: getSimpleIconNodeConfig(randomBlockConfig, nodeTitleKey(RANDOM)),
});
