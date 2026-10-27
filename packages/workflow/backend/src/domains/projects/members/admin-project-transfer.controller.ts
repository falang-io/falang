import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Value import: Nest's `ValidationPipe` reads the DTO class from the parameter's type metadata.
// oxlint-disable-next-line consistent-type-imports
import { TransferProjectDto } from './dto/transfer-project.dto.js';
import { ProjectTransferService, type ITransferProjectResult } from './project-transfer.service.js';

/** `POST /admin/projects/:id/transfer` — a platform admin hands a project to another user (ADR 0070 (private)). */
@UseGuards(AdminGuard)
@Controller('admin/projects/:projectId')
export class AdminProjectTransferController {
  private readonly transferService: ProjectTransferService;

  constructor(@Inject(ProjectTransferService) transferService: ProjectTransferService) {
    this.transferService = transferService;
  }

  @Post('transfer')
  transfer(
    @Param('projectId') projectId: string,
    @Body() body: TransferProjectDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITransferProjectResult> {
    return this.transferService.transfer(projectId, user.id, body.login, body.previousOwnerRoles ?? []);
  }
}
