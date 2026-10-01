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
  [DELAY]: getSimpleIconNodeConfig(createSingleNumberActionBlockConfig({ label: 'delay (ms)', min: 0 }), 'Delay'),
  [DELAY_MICROSECONDS]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ label: 'delay (us)', min: 0 }),
    'Delay (microseconds)',
  ),
  [RANDOM_SEED]: getSimpleIconNodeConfig(createSingleNumberActionBlockConfig({ label: 'seed' }), 'Random seed'),
  [SERIAL_BEGIN]: getSimpleIconNodeConfig(
    createSingleNumberActionBlockConfig({ label: 'baud', min: 0 }),
    'Serial begin',
  ),
  [SERIAL_PRINT]: getSimpleIconNodeConfig(createSingleNumberActionBlockConfig({ label: 'value' }), 'Serial print'),
  [SERIAL_PRINTLN]: getSimpleIconNodeConfig(createSingleNumberActionBlockConfig({ label: 'value' }), 'Serial println'),
  [MILLIS]: getSimpleIconNodeConfig(createZeroArgReadBlockConfig('millis()'), 'Millis'),
  [MICROS]: getSimpleIconNodeConfig(createZeroArgReadBlockConfig('micros()'), 'Micros'),
  [RANDOM]: getSimpleIconNodeConfig(randomBlockConfig, 'Random'),
});
