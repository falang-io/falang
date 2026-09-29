import { zod, type IDataInfo } from '@falang/dto';

export const arrUnshiftDto = zod.object({
  arr: zod.string(),
  value: zod.string(),
});

export const arrUnshiftDataType = {
  type: arrUnshiftDto,
  default: () => ({
    arr: '',
    value: '',
  }),
} as const satisfies IDataInfo;
