import { createSchemeToken } from '@falang/di';
import type { EditorService } from './editor.service.js';

export const TOKEN_INLINE_EDITOR_SERVICE = createSchemeToken<EditorService>('INLINE_EDITOR_SERVICE');
