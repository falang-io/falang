import { createSchemeToken } from '@falang/di';
import type { BlockResizeService } from './block-resize.service.js';

export const TOKEN_BLOCK_RESIZE_SERVICE = createSchemeToken<BlockResizeService>('BLOCK_RESIZE_SERVICE');
