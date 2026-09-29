import { zod, type IDataInfo } from '@falang/dto';

/**
 * Calls one endpoint of an `external-api-structure` document — same shape as `callFunctionDto`
 * (`schemeId` + `iconId`), pointing at a document instead of directly *being* one: `schemeId` is
 * the `external-api-structure` document's id, `iconId` is the specific endpoint (`external-api-item`
 * node) id within it. Mirrors the old app's own `call_api` DTO, which reused `call_function`'s DTO
 * verbatim — see ADR 0019 (private).
 */
export const callApiDto = zod.object({
  schemeId: zod.string(),
  iconId: zod.string().nullable().optional(),
  parameters: zod.array(zod.string()),
  returnVariable: zod.string(),
});

export const callApiDataType = {
  type: callApiDto,
  default: () => ({
    schemeId: '',
    iconId: null,
    parameters: [],
    returnVariable: '',
  }),
} as const satisfies IDataInfo;
