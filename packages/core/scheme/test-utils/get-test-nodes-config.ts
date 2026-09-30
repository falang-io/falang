import {
  action,
  cycle,
  functionCfg,
  getOutConfigSimple,
  ifCfg,
  NodesGroup,
  switchCfg,
  zod,
  type IDataInfo,
} from '@falang/dto';

export const getTestNodesConfig = () => {
  const stringType = {
    type: zod.string(),
    default: () => '',
  } as const satisfies IDataInfo;
  const numberType = {
    type: zod.number(),
    default: () => 0,
  } as const satisfies IDataInfo;
  return new NodesGroup([
    action('action', stringType, { mods: ['mod1'] }),
    action('action2', numberType),
    action('action3', numberType),
    action('mod1', numberType),
    getOutConfigSimple('out', 'return'),
    getOutConfigSimple('out-break', 'break'),
    cycle('cycle', numberType),
    ...switchCfg({
      name: 'switch',
      data: numberType,
      optionData: numberType,
    }),
    ...functionCfg({
      name: 'function',
      data: stringType,
      footer: stringType,
      header: stringType,
    }),
    ...ifCfg('if', stringType),
    cycle('while', stringType),
  ]);
};
