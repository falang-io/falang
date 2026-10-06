import { IsObject, IsString, MinLength } from 'class-validator';

export class AgentCheckDocumentDto {
  @IsString()
  @MinLength(1)
  id!: string;

  /** The document's current node tree; validated against the document type's stack by the service, not here. */
  @IsObject()
  root!: Record<string, unknown>;
}
