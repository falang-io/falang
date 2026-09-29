import { zod, type IDataInfo } from '@falang/dto';

export const callFunctionDto = zod.object({
  schemeId: zod.string(),
  iconId: zod.string().nullable().optional(),
  parameters: zod.array(zod.string()),
  returnVariable: zod.string(),
});

export const callFunctionDataType = {
  type: callFunctionDto,
  default: () => ({
    schemeId: '',
    iconId: null,
    parameters: [],
    returnVariable: '',
  }),
} as const satisfies IDataInfo;
