import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../../internal-auth/project-token.guard.js';

/**
 * Receives one runner pod's own `NODE_V8_COVERAGE` output, pushed from its `SIGTERM` handler just
 * before it terminates — see ADR 0016 (private)'s "Runner-pod
 * coverage collection" implementation notes and `@falang/workflow-runner`'s `push-coverage.ts`
 * (the outbound counterpart of this). A pod's `/tmp` `emptyDir` is gone the moment it's deleted, so
 * this is how that coverage data survives at all — the same "leaves the pod over HTTP, never a
 * shared filesystem" shape as `internal-artifacts.controller.ts`'s artifact delivery, just in the
 * opposite direction. Guarded by `ProjectTokenGuard` like every other internal endpoint a runner pod
 * calls back into `backend` with, even though coverage data itself isn't sensitive per project —
 * consistency with the rest of this trust boundary matters more than a narrower guard here would.
 *
 * A no-op outside a coverage-instrumented run (`process.env.NODE_V8_COVERAGE` unset) — mirrors
 * `main.ts`'s own `registerCoverageShutdownHook` gate, so a plain dev/prod `backend` pays nothing
 * for this endpoint existing.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/coverage')
export class InternalCoverageController {
  @Post(':projectId')
  @HttpCode(204)
  async receive(@Param('projectId') projectId: string, @Body() coverageData: unknown): Promise<void> {
    const dir = process.env.NODE_V8_COVERAGE;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    // `coverage-runner-` (vs. plain `coverage-<pid>-<ts>.json`, what `backend`'s own automatic
    // flush writes into the same directory) only needs to not collide and not start with
    // `source-` — see `monocart-coverage-reports`' `readFromDir`, which treats every other
    // `*.json` file in the directory as a coverage entry regardless of its exact name.
    await writeFile(join(dir, `coverage-runner-${projectId}-${randomUUID()}.json`), JSON.stringify(coverageData));
  }
}
