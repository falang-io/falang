import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { Public } from '../../auth/auth/public.decorator.js';
import { PatOrJwtAuthGuard } from '../../auth/pat-or-jwt-auth.guard.js';
// oxlint-disable-next-line consistent-type-imports -- DTO classes are resolved by ValidationPipe from runtime type metadata.
import { UpsertProjectTemplateDto } from './dto/upsert-project-template.dto.js';
import {
  PROJECT_TEMPLATE_SLUG_PATTERN,
  ProjectTemplatesService,
  type IAdminProjectTemplate,
} from './project-templates.service.js';

interface ISyncRequest {
  user: IJwtPayloadUser;
  patProjectScope?: string | null;
}

/**
 * `PUT /admin/project-templates/by-slug/:slug` — creates or replaces a template by its slug, for templates
 * maintained as files and uploaded by a script. Unlike the rest of `/admin/*` it also accepts an admin's
 * personal access token (`Bearer flg_pat_…`), so the script needs no login: `@Public()` only skips the global
 * JWT-only guard, `PatOrJwtAuthGuard` then authenticates (JWT or PAT) and `AdminGuard` re-checks the role.
 * A project-scoped PAT is refused — it is meant for one project, not for platform administration.
 */
@Public()
@UseGuards(PatOrJwtAuthGuard, AdminGuard)
@Controller('admin/project-templates/by-slug')
export class AdminProjectTemplatesSyncController {
  private readonly service: ProjectTemplatesService;

  constructor(@Inject(ProjectTemplatesService) service: ProjectTemplatesService) {
    this.service = service;
  }

  @Put(':slug')
  upsert(
    @Req() request: ISyncRequest,
    @Param('slug') slug: string,
    @Body() body: UpsertProjectTemplateDto,
  ): Promise<IAdminProjectTemplate> {
    if (request.patProjectScope) throw new ForbiddenException('A project-scoped token cannot manage templates');
    if (slug.length > 100 || !PROJECT_TEMPLATE_SLUG_PATTERN.test(slug)) {
      throw new BadRequestException('A slug is lowercase latin letters, digits and dashes (at most 100 characters)');
    }
    return this.service.upsertBySlug(slug, body, request.user.id);
  }
}
