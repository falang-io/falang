import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { DebugService, type IDebugSessionSnapshot, type IStartedDebugSession } from './debug.service.js';
// Kept as value imports (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route — same rule `BuildController` follows.
// oxlint-disable-next-line consistent-type-imports
import { ConfigureBreakpointsDto } from './dto/configure-breakpoints.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { ResumeDebugDto } from './dto/resume-debug.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { StartDebugDto } from './dto/start-debug.dto.js';

/** Workflow debugger routes (ADR 0021 (private) §5) — dev-only, owner-scoped like `BuildController`'s `build`/`run`. */
@Controller('projects/:projectId/debug')
export class DebugController {
  private readonly debugService: DebugService;

  constructor(@Inject(DebugService) debugService: DebugService) {
    this.debugService = debugService;
  }

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  start(
    @Param('projectId') projectId: string,
    @Body() dto: StartDebugDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IStartedDebugSession> {
    return this.debugService.start(projectId, user.id, dto);
  }

  /** Polled by the client every 500ms while a session is `running`/`paused`. */
  @Get(':workflowId/state')
  getState(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IDebugSessionSnapshot> {
    return this.debugService.getState(projectId, user.id, workflowId);
  }

  @Post(':workflowId/breakpoints')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setBreakpoints(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() dto: ConfigureBreakpointsDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.debugService.setBreakpoints(projectId, user.id, workflowId, dto.breakpoints);
  }

  @Post(':workflowId/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() dto: ResumeDebugDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.debugService.resume(projectId, user.id, workflowId, dto.mode);
  }

  @Post(':workflowId/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.debugService.stop(projectId, user.id, workflowId);
  }
}
