import { zod, type IDataInfo } from '@falang/dto';
import { functionBodyParameterZod, variableInfoZod } from './types.js';

/** One endpoint signature of an external API — name, parameters, and an optional return type; declaration only, no implementation (mirrors old `LogicExternalApiItemBlockDto`'s reuse of a plain function-header signature, not a key/value pair). */
export const externalApiItemDto = zod.object({
  name: zod.string(),
  parameters: zod.array(functionBodyParameterZod),
  returnValue: variableInfoZod.optional(),
});

let externalApiItemDataTypeIndex = 0;

export const externalApiItemDataType = {
  type: externalApiItemDto,
  default: () => {
    externalApiItemDataTypeIndex += 1;
    return {
      name: `endpoint${externalApiItemDataTypeIndex}`,
      parameters: [],
    };
  },
} as const satisfies IDataInfo;
