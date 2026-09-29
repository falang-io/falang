import { createSchemeToken } from '@falang/di';
import type { ProjectService } from './project.service.js';

export const TOKEN_PROJECT_SERVICE = createSchemeToken<ProjectService>('PROJECT_SERVICE');
