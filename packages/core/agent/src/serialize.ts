import type { NodeStore } from '@falang/scheme';
import { getNodeStoreDto } from '@falang/scheme';

export const serializeTree = (root: NodeStore): string => JSON.stringify(getNodeStoreDto(root));
