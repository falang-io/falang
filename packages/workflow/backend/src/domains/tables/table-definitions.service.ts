import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { normalizeTableDocumentData, TABLE_DOCUMENT_TYPE, type ITableDocumentData } from '@falang/workflow-dto';
import type { Repository } from 'typeorm';
import { Document } from '../projects/documents/document.entity.js';

/** A loaded `table` document: its id, name and normalised field definitions. */
export interface ITableDefinition {
  readonly id: string;
  readonly name: string;
  readonly data: ITableDocumentData;
}

/** How long a loaded definition is trusted without an explicit `invalidate` (version restore writes documents directly). */
export const TABLE_DEFINITION_TTL_MS = 5000;

interface ICacheEntry {
  readonly projectId: string;
  readonly expiresAt: number;
  readonly definition: ITableDefinition;
}

/**
 * Loads the `table` document of `(projectId, tableId)` — the schema every record operation validates against. Cached
 * per process for a few seconds; `DocumentsService` calls `invalidate` after writing a table document.
 */
@Injectable()
export class TableDefinitionsService {
  private readonly documents: Repository<Document>;
  private readonly cache = new Map<string, ICacheEntry>();

  constructor(@InjectRepository(Document) documents: Repository<Document>) {
    this.documents = documents;
  }

  /** 404 when the document does not exist, belongs to another project or is not a `table` document. */
  async get(projectId: string, tableId: string): Promise<ITableDefinition> {
    const cached = this.cache.get(tableId);
    if (cached && cached.projectId === projectId && cached.expiresAt > Date.now()) return cached.definition;
    const document = await this.documents.findOneBy({ id: tableId, projectId });
    if (!document || document.type !== TABLE_DOCUMENT_TYPE) {
      throw new NotFoundException(`Table "${tableId}" not found`);
    }
    const normalized = normalizeTableDocumentData(null, document.data);
    // A stored definition that no longer validates is treated as empty rather than breaking every read.
    const data = normalized.ok ? normalized.data : { fields: [], nextFieldNo: 1 };
    const definition: ITableDefinition = { id: document.id, name: document.name, data };
    this.cache.set(tableId, { projectId, expiresAt: Date.now() + TABLE_DEFINITION_TTL_MS, definition });
    return definition;
  }

  invalidate(documentId: string): void {
    this.cache.delete(documentId);
  }
}
