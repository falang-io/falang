import { IsOptional, IsString, MinLength } from 'class-validator';

/** Body of `POST /tasks/:id/resolve` — `data`'s real type depends on the chosen option's `dataType` (validated in `TasksService.resolve`, not here — same "not deep-validated" posture as `CreateDocumentDto.data`). */
export class ResolveTaskDto {
  @IsString()
  @MinLength(1)
  answer!: string;

  @IsOptional()
  data?: string | number | boolean;
}
