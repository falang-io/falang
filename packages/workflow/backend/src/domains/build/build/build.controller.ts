import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import type { IApiSchedule } from './api-schedule.js';
import { BuildService, type IBuildResult, type IProjectFunctionSignature, type IStartedDevRun } from './build.service.js';
import type { IGeneratedFile } from './compile-project-documents.js';
// Kept as value imports (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { RunFunctionDto } from './dto/run-function.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { StartRunDto } from './dto/start-run.dto.js';
import type { IProjectVersionListItem, IProjectVersionSummary } from './project-version-summary.js';
import type { IWorkflowPosition } from './workflow-position.js';
import type { IRunFunctionResult } from './workflow-run.service.js';

@Controller('projects/:projectId')
export class BuildController {
  private readonly buildService: BuildService;

  constructor(@Inject(BuildService) buildService: BuildService) {
    this.buildService = buildService;
  }

  @Get('code')
  generateCode(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IGeneratedFile[]> {
    return this.buildService.generateCode(projectId, user.id);
  }

  @Post('build')
  @HttpCode(HttpStatus.ACCEPTED)
  build(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IBuildResult> {
    return this.buildService.build(projectId, user.id);
  }

  @Get('functions')
  listFunctions(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectFunctionSignature[]> {
    return this.buildService.listFunctions(projectId, user.id);
  }

  @Post('run')
  run(
    @Param('projectId') projectId: string,
    @Body() dto: RunFunctionDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRunFunctionResult> {
    return this.buildService.run(projectId, user.id, dto);
  }

  /** The toolbar's "Run" button — start-and-follow, unlike `run` above's start-and-await. See ADR 0022 (private). */
  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  startDevRun(
    @Param('projectId') projectId: string,
    @Body() dto: StartRunDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IStartedDevRun> {
    return this.buildService.startDevRun(projectId, user.id, dto);
  }

  /** Polled by the client while a run is watched — see `IWorkflowPosition`. */
  @Get('runs/:workflowId/:runId/position')
  getRunPosition(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IWorkflowPosition> {
    return this.buildService.getRunPosition(projectId, user.id, workflowId, runId);
  }

  @Post('stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<void> {
    await this.buildService.stop(projectId, user.id);
  }

  /** The `trigger-function-body` block's read-only schedule state — see ADR 0037 (private) §7. */
  @Get('schedules')
  listSchedules(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IApiSchedule[]> {
    return this.buildService.listSchedules(projectId, user.id);
  }

  /** Lets the client restore its Build/Stop toolbar state on page load — mirrors `getProdStatus` below, for the dev runner. */
  @Get('build/status')
  getDevStatus(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<{ running: boolean; taskQueue: string }> {
    return this.buildService.getDevStatus(projectId, user.id);
  }

  @Post('publish')
  @HttpCode(HttpStatus.ACCEPTED)
  publish(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IProjectVersionSummary> {
    return this.buildService.publish(projectId, user.id);
  }

  @Get('versions')
  listVersions(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectVersionListItem[]> {
    return this.buildService.listVersions(projectId, user.id);
  }

  @Post('versions/:versionNumber/activate')
  @HttpCode(HttpStatus.ACCEPTED)
  async activate(
    @Param('projectId') projectId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.buildService.activate(projectId, user.id, versionNumber);
  }

  @Post('versions/:versionNumber/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopVersion(
    @Param('projectId') projectId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.buildService.stopVersion(projectId, user.id, versionNumber);
  }

  /** The project-wide Start/Stop toggle (Versions modal) — distinct from per-version `activate`/`stopVersion` above. */
  @Get('versions/status')
  async getProdStatus(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<{ running: boolean }> {
    return { running: await this.buildService.isProdRunning(projectId, user.id) };
  }

  @Post('versions/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startProd(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<void> {
    await this.buildService.startProd(projectId, user.id);
  }

  @Post('versions/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopProd(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<void> {
    await this.buildService.stopProd(projectId, user.id);
  }

  @Delete('versions/:versionNumber')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVersion(
    @Param('projectId') projectId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.buildService.deleteVersion(projectId, user.id, versionNumber);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<void> {
    await this.buildService.deleteProject(projectId, user.id);
  }
}
