import { zod, type IDataInfo } from '@falang/dto';
import { enumValueTypeVariantZod } from './types';

export const enumHeadDto = zod.object({
  name: zod.string(),
  valueType: enumValueTypeVariantZod,
});

let enumHeadDataTypeIndex = 0;

export const enumHeadDataType = {
  type: enumHeadDto,
  default: () => {
    enumHeadDataTypeIndex += 1;
    return {
      name: `enum${enumHeadDataTypeIndex}`,
      valueType: 'string' as const,
    };
  },
} as const satisfies IDataInfo;
