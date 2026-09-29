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

export const getTextGroup = () => {
  const group = new NodesGroup([
    action('action', stringDataType),
    action('link', linkDataType),
    getOutConfigSimple('break', 'break'),
    getOutConfigSimple('continue', 'continue'),
    getOutConfigWithData('throw', 'throw', stringDataType),
    getOutConfigWithData('return', 'return', stringDataType),
    cycle('foreach', stringDataType),
    cycle('while', stringDataType),
    ...switchCfg({
      name: 'switch',
      data: stringDataType,
      optionData: stringDataType,
    }),
    ...functionCfg({
      name: 'function',
      data: stringDataType,
      footer: stringDataType,
      header: stringDataType,
    }),
    ...ifCfg('if', stringDataType),
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
