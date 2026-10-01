import type { IDataInfo } from '@falang/dto';
import {
  action,
  cycle,
  functionCfg,
  ifCfg,
  NodesGroup,
  switchCfg,
  parallelCfg,
  zod,
  pseudoCycleCfg,
  countourNodeConfig,
  getOutConfigSimple,
  getOutConfigWithData,
  modCfg,
} from '@falang/dto';

export const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

/** `data` shape for the `link` node — a reference to another document in the same project. */
export const linkDataType = {
  type: zod.object({ documentId: zod.string() }),
  default: () => ({ documentId: '' }),
} as const satisfies IDataInfo;

/** Mod kinds (side icons, ADR 0049 (private)) every host below accepts: the DRAKON timer. */
const TIMER_MODS = ['timer'] as const;

export const getTextGroup = () => {
  const group = new NodesGroup([
    action('action', stringDataType, { mods: TIMER_MODS }),
    action('link', linkDataType, { mods: TIMER_MODS }),
    modCfg('timer', stringDataType),
    getOutConfigSimple('break', 'break'),
    getOutConfigSimple('continue', 'continue'),
    getOutConfigWithData('throw', 'throw', stringDataType),
    getOutConfigWithData('return', 'return', stringDataType),
    cycle('foreach', stringDataType, { mods: TIMER_MODS }),
    cycle('while', stringDataType, { mods: TIMER_MODS }),
    ...switchCfg({
      name: 'switch',
      data: stringDataType,
      optionData: stringDataType,
      mods: TIMER_MODS,
    }),
    ...functionCfg({
      name: 'function',
      data: stringDataType,
      footer: stringDataType,
      header: stringDataType,
    }),
    ...ifCfg('if', stringDataType, { mods: TIMER_MODS }),
    ...parallelCfg('parallel'),
    pseudoCycleCfg('pseudo-cycle'),
    ...countourNodeConfig({
      name: 'contour',
      data: stringDataType,
      finishData: stringDataType,
      finishFooterData: stringDataType,
      functionData: stringDataType,
      functionReturnData: stringDataType,
      headerData: stringDataType,
    }),
  ]);
  return group;
};
