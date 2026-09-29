import { zod, type IDataInfo } from '@falang/dto';
import type { TExpressionType } from './types';
import { expressionTypeZod, variableInfoZod } from './types';

export const expressionDto = zod.object({
  expression: zod.string(),
  type: expressionTypeZod,
  variableType: variableInfoZod.nullable().optional(),
});

export const createExpressionDataType = (type: TExpressionType) => ({
  type: expressionDto,
  default: () => ({
    expression: '',
    type,
    variableType: null,
  }),
});

export type IExpressionDataType = zod.infer<typeof expressionDto>;

export const expressionDataType = {
  type: expressionDto,
  default: () => ({
    expression: '',
    type: 'create' as const,
    variableType: null,
  }),
} as const satisfies IDataInfo;
