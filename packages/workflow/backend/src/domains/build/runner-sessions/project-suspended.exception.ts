import { HttpException } from '@nestjs/common';
import type { TSuspendedReason } from '../../projects/projects/project.entity.js';

/** `423 { code: 'project_suspended', reason }` — every start of a runner for a suspended project (ADR 0067 (private) §3). */
export class ProjectSuspendedException extends HttpException {
  readonly reason: TSuspendedReason;

  constructor(reason: TSuspendedReason) {
    super(
      {
        statusCode: 423,
        code: 'project_suspended',
        reason,
        message:
          reason === 'balance'
            ? 'The project is suspended: the servers were switched off because the balance ran out'
            : 'The project is suspended by an administrator',
      },
      423,
    );
    this.reason = reason;
  }
}
