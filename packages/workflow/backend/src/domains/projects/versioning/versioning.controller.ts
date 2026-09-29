import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import type { ICommitInfo, IProjectSnapshot } from '@falang/versioning';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Kept as value imports (not `import type`): Nest's global `ValidationPipe` resolves the DTO class
// to validate against from this parameter's runtime type metadata, so erasing the import would
// silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { CommitDto } from './dto/commit.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { NameCommitDto } from './dto/name-commit.dto.js';
import { VersioningService } from './versioning.service.js';

@Controller('projects/:projectId/commits')
export class VersioningController {
  private readonly versioningService: VersioningService;

  constructor(@Inject(VersioningService) versioningService: VersioningService) {
    this.versioningService = versioningService;
  }

  @Get()
  listCommits(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<ICommitInfo[]> {
    return this.versioningService.listCommits(projectId, user.id);
  }

  /** Snapshots the working copy and commits it. `200`, not Nest's default `201` for `POST` — matches `IVersionStore.commit`'s own client contract (see ADR 0025 (private)). Returns `null` when nothing changed since `HEAD`. */
  @Post()
  @HttpCode(HttpStatus.OK)
  commit(
    @Param('projectId') projectId: string,
    @Body() dto: CommitDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ICommitInfo | null> {
    return this.versioningService.commit(projectId, user.id, dto);
  }

  @Get(':commitId')
  getSnapshot(
    @Param('projectId') projectId: string,
    @Param('commitId') commitId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectSnapshot> {
    return this.versioningService.getSnapshot(projectId, user.id, commitId);
  }

  /** Promotes an `auto` commit to `named` (or renames a `named` one) — metadata only. */
  @Patch(':commitId')
  nameCommit(
    @Param('projectId') projectId: string,
    @Param('commitId') commitId: string,
    @Body() dto: NameCommitDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ICommitInfo> {
    return this.versioningService.nameCommit(projectId, user.id, commitId, dto.message);
  }

  /** Overwrites the working copy in place with this commit's snapshot, then auto-creates a "Restore …" commit. `200`, matching `commit`'s own override of Nest's `POST` default. */
  @Post(':commitId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('projectId') projectId: string,
    @Param('commitId') commitId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ICommitInfo> {
    return this.versioningService.restore(projectId, user.id, commitId);
  }
}
