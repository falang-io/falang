import { zod, type IDataInfo } from '@falang/dto';
import { variableInfoZod } from './types.js';

export const createVarDto = zod.object({
  name: zod.string(),
  variableType: variableInfoZod,
  /** Initializer expression, e.g. `10` or `{ a: 10 }`. Omitted/empty falls back to `defaultValueExpression`. */
  value: zod.string().optional(),
});

let createVarDataTypeIndex = 0;

export const createVarDataType = {
  type: createVarDto,
  default: () => {
    createVarDataTypeIndex += 1;
    return {
      name: 'x',
      variableType: {
        type: 'string',
      },
    };
  },
} as const satisfies IDataInfo<typeof createVarDto>;
