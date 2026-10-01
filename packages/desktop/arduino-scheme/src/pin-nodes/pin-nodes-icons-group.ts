import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { PIN_READ_ANALOG, PIN_READ_DIGITAL, PIN_WRITE_ANALOG, PIN_WRITE_DIGITAL } from '@falang/desktop-arduino-dto/src/pin-nodes.js';
import { pinNodeConfigs } from './pin-node-configs.js';
import { pinWriteDigitalBlockConfig } from './pin-write-digital.block.js';
import { pinWriteAnalogBlockConfig } from './pin-write-analog.block.js';
import { pinReadBlockConfig } from './pin-read.block.js';

/**
 * Passed as `extraIconsGroups` to `@falang/typescript-scheme`'s `functionalSchemeFactory` (see
 * ADR 0023 (private)) — the same extension seam `@falang/workflow-scheme` already uses for its
 * own per-vendor integration nodes, so none of `@falang/typescript-scheme`/`@falang/scheme` need to
 * know Arduino pins exist.
 */
export const pinNodesIconsGroup = new IconsGroup(new NodesGroup(pinNodeConfigs), {
  [PIN_WRITE_DIGITAL]: getSimpleIconNodeConfig(pinWriteDigitalBlockConfig, 'Set digital pin'),
  [PIN_WRITE_ANALOG]: getSimpleIconNodeConfig(pinWriteAnalogBlockConfig, 'Set analog pin (PWM)'),
  [PIN_READ_DIGITAL]: getSimpleIconNodeConfig(pinReadBlockConfig, 'Read digital pin'),
  [PIN_READ_ANALOG]: getSimpleIconNodeConfig(pinReadBlockConfig, 'Read analog pin'),
});
