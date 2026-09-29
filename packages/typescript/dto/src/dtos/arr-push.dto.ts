import { zod, type IDataInfo } from '@falang/dto';

export const arrPushDto = zod.object({
  arr: zod.string(),
  value: zod.string(),
});

export const arrPushDataType = {
  type: arrPushDto,
  default: () => ({
    arr: '',
    value: '',
  }),
} as const satisfies IDataInfo;
