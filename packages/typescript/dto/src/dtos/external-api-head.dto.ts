import { zod, type IDataInfo } from '@falang/dto';

export const externalApiHeadDto = zod.object({
  name: zod.string(),
});

let externalApiHeadDataTypeIndex = 0;

export const externalApiHeadDataType = {
  type: externalApiHeadDto,
  default: () => {
    externalApiHeadDataTypeIndex += 1;
    return {
      name: `api${externalApiHeadDataTypeIndex}`,
    };
  },
} as const satisfies IDataInfo;
