import { createSchemeToken } from '@falang/di';
import type { ValidationStore } from './validation.store.js';

export const TOKEN_VALIDATION_STORE = createSchemeToken<ValidationStore>('VALIDATION_STORE');
