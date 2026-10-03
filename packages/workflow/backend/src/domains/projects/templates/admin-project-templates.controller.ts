import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// oxlint-disable-next-line consistent-type-imports -- DTO classes are resolved by ValidationPipe from runtime type metadata.
import { ImportProjectDto } from '../export/dto/import-project.dto.js';
import type { IProjectExportPayload } from '../export/project-export.service.js';
// oxlint-disable-next-line consistent-type-imports
import { CreateProjectTemplateDto } from './dto/create-project-template.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { RefreshProjectTemplateDto } from './dto/refresh-project-template.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateProjectTemplateDto } from './dto/update-project-template.dto.js';
import { ProjectTemplatesService, type IAdminProjectTemplate } from './project-templates.service.js';

/** `/admin/project-templates` — admin management of the templates offered by "New project". */
@UseGuards(AdminGuard)
@Controller('admin/project-templates')
export class AdminProjectTemplatesController {
  private readonly service: ProjectTemplatesService;

  constructor(@Inject(ProjectTemplatesService) service: ProjectTemplatesService) {
    this.service = service;
  }

  @Get()
  list(): Promise<IAdminProjectTemplate[]> {
    return this.service.listAll();
  }

  @Post()
  create(@CurrentUser() user: IJwtPayloadUser, @Body() body: CreateProjectTemplateDto): Promise<IAdminProjectTemplate> {
    return this.service.create(user.id, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectTemplateDto): Promise<IAdminProjectTemplate> {
    return this.service.update(id, body);
  }

  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @CurrentUser() user: IJwtPayloadUser,
    @Param('id') id: string,
    @Body() body: RefreshProjectTemplateDto,
  ): Promise<IAdminProjectTemplate> {
    return this.service.refresh(id, user.id, body.sourceProjectId);
  }

  @Put(':id/payload')
  replacePayload(@Param('id') id: string, @Body() body: ImportProjectDto): Promise<IAdminProjectTemplate> {
    return this.service.replacePayload(id, body);
  }

  @Get(':id/export')
  exportPayload(@Param('id') id: string): Promise<IProjectExportPayload> {
    return this.service.getPayload(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
