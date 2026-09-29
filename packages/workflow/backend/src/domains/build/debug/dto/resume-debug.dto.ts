import { IsIn } from 'class-validator';

/** Body of `POST /projects/:projectId/debug/:workflowId/resume`. `'step-into'`/`'step-out'` are deferred, see `@falang/debug`'s `TDebugResumeMode`. */
export class ResumeDebugDto {
  @IsIn(['continue', 'step-over'])
  mode!: 'continue' | 'step-over';
}
