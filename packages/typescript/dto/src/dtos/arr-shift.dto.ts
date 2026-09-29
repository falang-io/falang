import { zod, type IDataInfo } from '@falang/dto';

export const arrShiftDto = zod.object({
  arr: zod.string(),
  variable: zod.string(),
});

export const arrShiftDataType = {
  type: arrShiftDto,
  default: () => ({
    arr: '',
    variable: '',
  }),
} as const satisfies IDataInfo;
