import { zod, type IDataInfo } from '@falang/dto';

export const schemeHeaderDto = zod.object({});

export const schemeHeaderDataType = {
  type: schemeHeaderDto,
  default: () => ({}),
} as const satisfies IDataInfo;
