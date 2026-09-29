import type { IDataInfo } from '@falang/dto';
import { mindTreeCfg, NodesGroup, zod } from '@falang/dto';
import { enumHeadDataType } from './dtos/enum-head.dto.js';
import { enumItemDataType } from './dtos/enum-item.dto.js';

export const ENUM_STRUCTURE_NAME = 'enum-structure';

const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

const nullDataType = {
  type: zod.null(),
  default: () => null,
} as const satisfies IDataInfo;

export const enumStructureNodes = new NodesGroup([
  ...mindTreeCfg({
    name: ENUM_STRUCTURE_NAME,
    body: nullDataType,
    child: enumItemDataType,
    header: stringDataType,
    thread: enumHeadDataType,
  }),
]);
