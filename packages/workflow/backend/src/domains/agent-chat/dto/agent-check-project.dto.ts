import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentCheckDocumentDto } from './agent-check-document.dto.js';

/**
 * Body of `POST /projects/:projectId/agent/check-project` — the trees the editor currently holds
 * (its autosave is debounced), overlaid on the stored documents. Bounded only by Nest's default JSON
 * body limit (100 kB). ADR 0062 (private).
 */
export class AgentCheckProjectDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentCheckDocumentDto)
  documents!: AgentCheckDocumentDto[];
}
