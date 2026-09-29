import {
  Inject,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { from, mergeMap, tap } from 'rxjs';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { VersioningService } from './versioning.service.js';

/** Matches the mutating project-content routes this rule applies to: `POST|PATCH|DELETE` under a project's `documents`/`folders`. Deliberately excludes `POST /projects/import`, `/commits/*`, and every build/publish route — see ADR 0025 (private)'s "Correction to decision 2 (2026-09-18)". */
const MATCHING_METHODS = new Set(['POST', 'PATCH', 'DELETE']);
const MATCHING_PATH = /^\/projects\/[^/]+\/(documents|folders)(\/|$)/;

/**
 * Enforces the session-gap auto-version rule on the receiving side of every write, registered
 * globally (`APP_INTERCEPTOR`) from `VersioningModule` rather than per-controller — `VersioningModule`
 * already imports `ProjectExportModule` (which imports `DocumentsModule`), so `DocumentsModule`/
 * `FoldersModule` importing `VersioningModule` back would be a module cycle.
 */
@Injectable()
export class SessionGapAutoVersionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SessionGapAutoVersionInterceptor.name);
  private readonly versioningService: VersioningService;

  constructor(@Inject(VersioningService) versioningService: VersioningService) {
    this.versioningService = versioningService;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{
        method: string;
        path?: string;
        url: string;
        params: Record<string, string>;
        user?: IJwtPayloadUser;
      }>();
    const projectId = request.params?.projectId;
    const path = request.path ?? request.url.split('?')[0];

    if (!this.matches(request.method, path, projectId, request.user)) {
      return next.handle();
    }

    const { user } = request;
    if (!user || !projectId) {
      return next.handle();
    }

    return from(this.runAutoVersion(projectId, user.id)).pipe(
      mergeMap(() => next.handle()),
      tap(() => {
        this.versioningService.markEdited(projectId).catch((error: unknown) => {
          this.logger.error(
            `markEdited failed for project "${projectId}"`,
            error instanceof Error ? error.stack : error,
          );
        });
      }),
    );
  }

  private matches(
    method: string,
    path: string,
    projectId: string | undefined,
    user: IJwtPayloadUser | undefined,
  ): boolean {
    return Boolean(projectId) && Boolean(user) && MATCHING_METHODS.has(method) && MATCHING_PATH.test(path);
  }

  /** Errors from the auto-commit must not block the edit itself — logged, then swallowed. */
  private async runAutoVersion(projectId: string, ownerId: string): Promise<void> {
    try {
      await this.versioningService.autoVersionBeforeEdit(projectId, ownerId);
    } catch (error) {
      this.logger.error(
        `autoVersionBeforeEdit failed for project "${projectId}"`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
