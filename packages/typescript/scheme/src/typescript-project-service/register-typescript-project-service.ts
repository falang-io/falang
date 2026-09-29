import type { DependencyContainer } from '@falang/di';
import { Lifecycle } from '@falang/di';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from './typescript-project.service.token.js';
import { TypescriptProjectService } from './typescript-project.service.js';

export const registerTypescriptProjectService = (container: DependencyContainer) => {
  container.register(TOKEN_TYPESCRIPT_PROJECT_SERVICE, TypescriptProjectService, {
    lifecycle: Lifecycle.Singleton,
  });
};
