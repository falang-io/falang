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
import { functionBodyDataType } from './dtos/function-body.dto.js';

export const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

export const getTextGroup = () => {
  const group = new NodesGroup([
    action('action', stringDataType),
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
      data: functionBodyDataType,
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
