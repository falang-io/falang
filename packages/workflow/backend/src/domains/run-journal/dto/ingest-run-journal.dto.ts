// oxlint-disable max-classes-per-file -- the batch DTO and its entry DTO belong together.
import { RUN_JOURNAL_INGEST_MAX_ENTRIES } from '@falang/workflow-dto';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { JOURNAL_KINDS, JOURNAL_LEVELS } from '../run-journal.types.js';

export const MAX_INGEST_ENTRIES = RUN_JOURNAL_INGEST_MAX_ENTRIES;

export class RunJournalIngestEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  workflowId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  runId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  sourceKey!: string;

  @IsIn(JOURNAL_KINDS)
  kind!: string;

  @IsIn(JOURNAL_LEVELS)
  level!: string;

  /** Capped (not rejected) by `prepareJournalEntries` — a long message must not fail the whole batch. */
  @IsString()
  message!: string;

  /** Arbitrary structured details — not deep-validated, limited by `prepareJournalEntries`. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  documentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  nodeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  vendor?: string | null;

  /** Epoch ms; anything else falls back to the receive time in `prepareJournalEntries` (never rejects the batch). */
  @IsDefined()
  ts!: number;
}

/** Body of `POST /internal/projects/:projectId/run-journal` (contract §5). */
export class IngestRunJournalDto {
  @IsIn(['dev', 'prod'])
  env!: 'dev' | 'prod';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  buildId?: string | null;

  @IsArray()
  @ArrayMaxSize(MAX_INGEST_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => RunJournalIngestEntryDto)
  entries!: RunJournalIngestEntryDto[];
}
