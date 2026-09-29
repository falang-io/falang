import type { IDataInfo } from '@falang/dto';
import { mindTreeCfg, NodesGroup, zod } from '@falang/dto';
import { externalApiHeadDataType } from './dtos/external-api-head.dto.js';
import { externalApiItemDataType } from './dtos/external-api-item.dto.js';

export const EXTERNAL_API_STRUCTURE_NAME = 'external-api-structure';

const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

const nullDataType = {
  type: zod.null(),
  default: () => null,
} as const satisfies IDataInfo;

export const externalApiStructureNodes = new NodesGroup([
  ...mindTreeCfg({
    name: EXTERNAL_API_STRUCTURE_NAME,
    body: nullDataType,
    child: externalApiItemDataType,
    header: stringDataType,
    thread: externalApiHeadDataType,
  }),
]);
