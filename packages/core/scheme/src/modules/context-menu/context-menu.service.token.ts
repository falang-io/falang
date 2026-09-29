import { createSchemeToken } from '@falang/di';
import type { ContextMenuService } from './context-menu.service.js';

export const TOKEN_CONTEXT_MENU = createSchemeToken<ContextMenuService>('CONTEXT_MENU');
