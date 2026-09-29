import { zod, type IDataInfo } from '@falang/dto';
import { variableInfoZod } from './types.js';

export const objectPropertyDto = zod.object({
  name: zod.string(),
  variableType: variableInfoZod,
});

let objectPropertyDataTypeIndex = 0;

export const objectPropertyDataType = {
  type: objectPropertyDto,
  default: () => {
    objectPropertyDataTypeIndex += 1;
    return {
      name: `property${objectPropertyDataTypeIndex}`,
      variableType: {
        type: 'string',
      },
    };
  },
} as const satisfies IDataInfo<typeof objectPropertyDto>;
