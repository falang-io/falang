import { Controller, Get, Inject, Param } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';
import { IntegrationVendorDataService } from './integration-vendor-data.service.js';

/**
 * Called by the logged-in editor (JWT-authenticated, project-ownership-scoped, same pattern as
 * `IntegrationFieldOptionsController`) to read back backend-written, non-secret data about a
 * configured instance — e.g. a database credential's synced schema. See
 * ADR 0039 (private) §4. Deliberately doesn't check that `credentialId`
 * names a real instance in the `integrations` document — an id with nothing stored for it just
 * returns `{}`, same as one that never existed or was removed (a re-imported project's own "not
 * synced" gap this ADR accepts).
 */
@Controller('projects/:projectId/integrations')
export class IntegrationVendorDataController {
  private readonly projectsService: ProjectsService;
  private readonly vendorData: IntegrationVendorDataService;

  constructor(
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(IntegrationVendorDataService) vendorData: IntegrationVendorDataService,
  ) {
    this.projectsService = projectsService;
    this.vendorData = vendorData;
  }

  @Get(':credentialId/vendor-data')
  async getVendorData(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<Record<string, Record<string, unknown>>> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    return this.vendorData.getAll(projectId, credentialId);
  }
}
