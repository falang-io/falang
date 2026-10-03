import { ConflictException } from '@nestjs/common';
import { Not, type Repository } from 'typeorm';
import type { Document } from './document.entity.js';

/**
 * A document name is unique within a project, case-insensitively, across every document type (a
 * function and an object type may not share a name either) — 409 naming the clash. `exceptId` is the
 * document being renamed. Called from `DocumentsService.create`/`update`, the one chokepoint REST and
 * both MCP create/rename paths go through; version restore writes the repository directly and so may
 * still restore a legacy duplicate.
 */
export const assertUniqueDocumentName = async (
  documents: Repository<Document>,
  projectId: string,
  name: string,
  exceptId: string | null,
): Promise<void> => {
  const wanted = name.trim().toLowerCase();
  const others = await documents.find({
    where: exceptId === null ? { projectId } : { projectId, id: Not(exceptId) },
    select: { id: true, name: true },
  });
  if (others.some((other) => other.name.trim().toLowerCase() === wanted)) {
    throw new ConflictException(
      `A document named "${name}" already exists in this project (names are case-insensitive)`,
    );
  }
};
