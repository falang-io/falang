import type { INode } from '@falang/dto';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string | null;

  /** Not deep-validated — arbitrary node trees are produced by the trusted, authenticated editor client. */
  @IsOptional()
  root?: INode | null;

  @IsOptional()
  data?: unknown;

  /**
   * The caller's own lock owner id, so a save from a browser tab that itself holds the agent lock on
   * this document doesn't 409 against its own lock (ADR 0034 §2.4) — passed through verbatim to
   * `DocumentsService.update`'s `lockOwner` parameter, same as the MCP host already does when calling
   * the service directly (see that parameter's own doc comment).
   */
  @IsOptional()
  @IsString()
  lockOwner?: string;
}
