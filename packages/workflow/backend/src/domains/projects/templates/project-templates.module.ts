import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../../users/users/users.module.js';
import { ProjectExportModule } from '../export/project-export.module.js';
import { AdminProjectTemplatesController } from './admin-project-templates.controller.js';
import { ProjectTemplate } from './project-template.entity.js';
import { ProjectTemplatesController } from './project-templates.controller.js';
import { ProjectTemplatesService } from './project-templates.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectTemplate]), UsersModule, ProjectExportModule],
  controllers: [ProjectTemplatesController, AdminProjectTemplatesController],
  providers: [ProjectTemplatesService],
  exports: [ProjectTemplatesService],
})
export class ProjectTemplatesModule {}
