import type { IDataInfo } from '@falang/dto';
import { mindTreeCfg, NodesGroup, zod } from '@falang/dto';
import { objectPropertyDataType } from './dtos/object-property.dto.js';

export const OBJECTS_STRUCTURE_NAME = 'objects-structure';

const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

const nullDataType = {
  type: zod.null(),
  default: () => null,
} as const satisfies IDataInfo;

let threadTitleDataTypeIndex = 0;

const threadTitleDataType = {
  type: zod.string(),
  default: () => {
    threadTitleDataTypeIndex += 1;
    return `object${threadTitleDataTypeIndex}`;
  },
} as const satisfies IDataInfo;

export const objectStructureNodes = new NodesGroup([
  ...mindTreeCfg({
    name: OBJECTS_STRUCTURE_NAME,
    body: nullDataType,
    child: objectPropertyDataType,
    header: stringDataType,
    thread: threadTitleDataType,
  }),
]);
