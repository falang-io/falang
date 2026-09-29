import { IsIn } from 'class-validator';

/** Body of `POST /internal/tasks/:projectId/:taskId/close` — the compiled workflow's own close on timeout/cancellation, see the ADR §4. */
export class CloseTaskDto {
  @IsIn(['expired', 'cancelled'])
  status!: 'expired' | 'cancelled';
}
