import { createSchemeToken } from '@falang/di';
import type { DebuggerService } from './debugger.service.js';

export const TOKEN_DEBUGGER = createSchemeToken<DebuggerService>('DEBUGGER');
