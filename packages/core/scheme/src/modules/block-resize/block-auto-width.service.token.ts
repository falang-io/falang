import { createSchemeToken } from '@falang/di';
import type { BlockAutoWidthService } from './block-auto-width.service.js';

export const TOKEN_BLOCK_AUTO_WIDTH = createSchemeToken<BlockAutoWidthService>('BLOCK_AUTO_WIDTH');
