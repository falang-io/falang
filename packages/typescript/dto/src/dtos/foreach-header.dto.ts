import { zod, type IDataInfo } from '@falang/dto';

export const foreachHeaderDto = zod.object({
  arr: zod.string(),
  item: zod.string(),
  index: zod.string(),
});

export const foreachHeaderDataType = {
  type: foreachHeaderDto,
  default: () => ({
    arr: '',
    item: '',
    index: '',
  }),
} as const satisfies IDataInfo;
