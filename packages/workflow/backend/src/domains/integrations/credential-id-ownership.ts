import { ConflictException } from '@nestjs/common';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import type { Document } from '../projects/documents/document.entity.js';

/** Instance ids named by an `integrations` document's data (tolerates malformed/absent data). */
export const extractInstanceIds = (data: unknown): readonly string[] => {
  const instances = (data as Partial<IIntegrationsDocumentData> | null | undefined)?.instances;
  if (!Array.isArray(instances)) return [];
  return instances
    .map((instance) => (instance as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string');
};

/**
 * Credential (integration instance) ids are chosen by the client and are used, together with the
 * project id, as routing/state keys across the whole platform. An id already used by another
 * project's `integrations` document must therefore be rejected (409) — see the security audit P0-6
 * (ADR 0044 (private)). Called from `DocumentsService.create`/`update` for `integrations` documents,
 * which every write path (REST, MCP, version restore, import) funnels through.
 *
 * The SQL `LIKE` is only a cheap pre-filter on the JSON text (`simple-json` column); the exact id
 * match is re-verified on the parsed data.
 */
export const assertCredentialIdsNotOwnedByOtherProject = async (
  documents: Repository<Document>,
  projectId: string,
  data: unknown,
): Promise<void> => {
  const ids = extractInstanceIds(data);
  for (const id of ids) {
    // '!' as the LIKE escape character: no backslash, so it behaves the same on Postgres and SQLite.
    const escaped = JSON.stringify(id).replaceAll(/[!%_]/g, (char) => `!${char}`);
    // oxlint-disable-next-line no-await-in-loop -- a handful of instances per project.
    const candidates = await documents
      .createQueryBuilder('document')
      .where('document.type = :type', { type: INTEGRATIONS_DOCUMENT_TYPE })
      .andWhere('document.projectId != :projectId', { projectId })
      .andWhere("document.data LIKE :pattern ESCAPE '!'", { pattern: `%"id":${escaped}%` })
      .getMany();
    if (candidates.some((candidate) => extractInstanceIds(candidate.data).includes(id))) {
      throw new ConflictException(`Credential id "${id}" is already used by another project`);
    }
  }
};
