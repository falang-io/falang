import { createSchemeToken } from '@falang/di';
import type { HistoryStore } from './history.store.js';

export const TOKEN_HISTORY = createSchemeToken<HistoryStore>('HISTORY');
