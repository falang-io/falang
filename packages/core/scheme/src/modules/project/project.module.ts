import { Lifecycle } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { ProjectService } from './project.service.js';
import { TOKEN_PROJECT_SERVICE } from './project.service.token.js';

export class ProjectModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_PROJECT_SERVICE, ProjectService, {
      lifecycle: Lifecycle.ContainerScoped,
    });
  }
}
