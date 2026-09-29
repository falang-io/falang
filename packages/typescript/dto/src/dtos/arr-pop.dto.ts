import { zod, type IDataInfo } from '@falang/dto';

export const arrPopDto = zod.object({
  arr: zod.string(),
  variable: zod.string(),
});

export const arrPopDataType = {
  type: arrPopDto,
  default: () => ({
    arr: '',
    variable: '',
  }),
} as const satisfies IDataInfo;
