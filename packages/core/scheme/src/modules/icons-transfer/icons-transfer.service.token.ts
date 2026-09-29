import { createSchemeToken } from '@falang/di';
import type { IconsTransferService } from './icons-transfer.service.js';

export const TOKEN_ICONS_TRANSFER_SERVICE = createSchemeToken<IconsTransferService>('ICONS_TRANSFER');
