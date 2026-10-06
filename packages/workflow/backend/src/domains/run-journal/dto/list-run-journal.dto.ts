import { RUN_JOURNAL_PAGE_DEFAULT_LIMIT, RUN_JOURNAL_PAGE_MAX_LIMIT } from '@falang/workflow-dto';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const DEFAULT_JOURNAL_LIMIT = RUN_JOURNAL_PAGE_DEFAULT_LIMIT;
export const MAX_JOURNAL_LIMIT = RUN_JOURNAL_PAGE_MAX_LIMIT;

/** Query of the two journal read routes — `after` is the last seen entry id (a bigint as a string). */
export class ListRunJournalQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,19}$/)
  after?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number.parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  @Max(MAX_JOURNAL_LIMIT)
  limit?: number;
}
