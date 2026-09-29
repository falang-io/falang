import { zod, type IDataInfo } from '@falang/dto';

export const arrSliceDto = zod.object({
  arr: zod.string(),
  variable: zod.string(),
  start: zod.string(),
  end: zod.string(),
});

export const arrSliceDataType = {
  type: arrSliceDto,
  default: () => ({
    arr: '',
    variable: '',
    start: '',
    end: '',
  }),
} as const satisfies IDataInfo;
