import { zod, type IDataInfo } from '@falang/dto';

export const fromToCycleHeaderDto = zod.object({
  from: zod.string(),
  to: zod.string(),
  item: zod.string(),
});

export const fromToCycleHeaderDataType = {
  type: fromToCycleHeaderDto,
  default: () => ({
    from: '',
    to: '',
    item: '',
  }),
} as const satisfies IDataInfo;
