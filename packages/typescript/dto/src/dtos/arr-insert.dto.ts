import { zod, type IDataInfo } from '@falang/dto';

export const arrInsertDto = zod.object({
  arr: zod.string(),
  start: zod.string(),
  insertArr: zod.string(),
});

export const arrInsertDataType = {
  type: arrInsertDto,
  default: () => ({
    arr: '',
    start: '',
    insertArr: '',
  }),
} as const satisfies IDataInfo;
