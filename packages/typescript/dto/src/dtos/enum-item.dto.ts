import { zod, type IDataInfo } from '@falang/dto';

export const enumItemDto = zod.object({
  key: zod.string(),
  value: zod.union([zod.string(), zod.number()]),
});

export const enumItemDataType = {
  type: enumItemDto,
  default: () => ({
    key: '',
    value: '',
  }),
} as const satisfies IDataInfo;
