import { createSchemeToken } from '@falang/di';
import type { TypescriptProjectService } from './typescript-project.service.js';

export const TOKEN_TYPESCRIPT_PROJECT_SERVICE =
  createSchemeToken<TypescriptProjectService>('TYPESCRIPT_PROJECT_SERVICE');
