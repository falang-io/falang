import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from './project-token.guard.js';

/**
 * Lets another internal service (the standalone `activepieces` adapter) check that a caller's
 * `x-internal-project-token` really belongs to the `projectId` in the body, instead of that service
 * holding a shared secret every runner pod would also need. The guard does the whole check
 * (token vs. body `projectId`); reaching the handler means it passed. Answers 200 `{ ok: true }`,
 * otherwise the guard's own 403.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/auth')
export class InternalAuthController {
  @Post('verify-project-token')
  @HttpCode(200)
  verify(): { ok: true } {
    return { ok: true };
  }
}
