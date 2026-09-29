import type { TCommitKind } from '@falang/versioning';
import { IsIn, IsString } from 'class-validator';

export class CommitDto {
  @IsIn(['auto', 'named'])
  kind!: TCommitKind;

  @IsString()
  message!: string;
}
