import { zod, type IDataInfo } from '@falang/dto';
import { variableInfoZod } from './types';

export const switchThreadHeaderDto = zod.object({
  expression: zod.string(),
  variableType: variableInfoZod.nullable().optional(),
});

export const switchThreadHeaderDataType = {
  type: switchThreadHeaderDto,
  default: () => ({
    expression: '',
    variableType: null,
  }),
} as const satisfies IDataInfo;
