import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserLimitsModule } from '../../admin/user-limits/user-limits.module.js';
import { RunnerSessionsModule } from '../../build/runner-sessions/runner-sessions.module.js';
import { Project } from '../projects/project.entity.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProjectRuntimeSettingsController } from './project-runtime-settings.controller.js';
import { ProjectRuntimeSettingsService } from './project-runtime-settings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Project]), ProjectsModule, UserLimitsModule, RunnerSessionsModule],
  controllers: [ProjectRuntimeSettingsController],
  providers: [ProjectRuntimeSettingsService],
  exports: [ProjectRuntimeSettingsService],
})
export class ProjectRuntimeSettingsModule {}
