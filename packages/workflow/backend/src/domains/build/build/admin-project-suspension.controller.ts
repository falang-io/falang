import { Controller, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { ProjectSuspensionService } from './project-suspension.service.js';

/** `POST /admin/projects/:id/suspend|resume` — the administrator's switch (reason `admin`), ADR 0067 (private) §3. */
@UseGuards(AdminGuard)
@Controller('admin/projects/:projectId')
export class AdminProjectSuspensionController {
  private readonly suspension: ProjectSuspensionService;

  constructor(@Inject(ProjectSuspensionService) suspension: ProjectSuspensionService) {
    this.suspension = suspension;
  }

  @Post('suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(@Param('projectId') projectId: string): Promise<void> {
    await this.suspension.suspend(projectId, 'admin');
  }

  @Post('resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(@Param('projectId') projectId: string): Promise<void> {
    await this.suspension.resume(projectId);
  }
}
