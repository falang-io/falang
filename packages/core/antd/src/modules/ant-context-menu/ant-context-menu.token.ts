import { createSchemeToken } from '@falang/di';
import type { AntContextMenuService } from './ant-context-menu.service.js';

export const TOKEN_ANT_CONTEXT_MENU = createSchemeToken<AntContextMenuService>('ANT_CONTEXT_MENU');
