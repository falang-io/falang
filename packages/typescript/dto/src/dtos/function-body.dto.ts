import { zod, type IDataInfo } from '@falang/dto';
import { functionBodyParameterZod, variableInfoZod } from './types.js';

export const functionBodyDto = zod.object({
  parameters: zod.array(functionBodyParameterZod),
  returnValue: variableInfoZod.optional(),
});

export const functionBodyDataType = {
  type: functionBodyDto,
  default: () => ({
    parameters: [],
  }),
} as const satisfies IDataInfo;
