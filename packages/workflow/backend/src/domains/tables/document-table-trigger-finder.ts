import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import { TABLES_VENDOR } from '@falang/workflow-integrations-tables';
import type { Repository } from 'typeorm';
import { Document } from '../projects/documents/document.entity.js';
import type { ITableTriggerTarget } from './table-change-dispatch.js';

const BINDINGS_TTL_MS = 5000;

/** Finds the trigger-functions of a project bound to `table-record-<op>` of one table. */
export interface ITableTriggerFinder {
  find(projectId: string, tableId: string, triggerName: string): Promise<readonly ITableTriggerTarget[]>;
}

interface ITriggerFunctionBody {
  readonly vendor?: string;
  readonly triggerName?: string;
  readonly triggerConfig?: Record<string, string>;
}

/** Loads the project's `trigger-function` documents (5 s cache) and filters the ones bound to a table trigger. */
@Injectable()
export class DocumentTableTriggerFinder implements ITableTriggerFinder {
  private readonly documents: Repository<Document>;
  private readonly cache = new Map<string, { expiresAt: number; bindings: readonly ITableBinding[] }>();

  constructor(@InjectRepository(Document) documents: Repository<Document>) {
    this.documents = documents;
  }

  async find(projectId: string, tableId: string, triggerName: string): Promise<readonly ITableTriggerTarget[]> {
    const bindings = await this.loadBindings(projectId);
    return bindings.filter((binding) => binding.tableId === tableId && binding.triggerName === triggerName);
  }

  private async loadBindings(projectId: string): Promise<readonly ITableBinding[]> {
    const cached = this.cache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) return cached.bindings;
    const documents = await this.documents.find({ where: { projectId, type: TRIGGER_FUNCTION_NAME } });
    const bindings = documents.flatMap((document): ITableBinding[] => {
      const body = document.root?.children?.[1];
      if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return [];
      const data = body.data as ITriggerFunctionBody | undefined;
      if (data?.vendor !== TABLES_VENDOR || !data.triggerName) return [];
      return [
        {
          documentId: document.id,
          name: document.name,
          triggerName: data.triggerName,
          tableId: data.triggerConfig?.table ?? '',
        },
      ];
    });
    this.cache.set(projectId, { expiresAt: Date.now() + BINDINGS_TTL_MS, bindings });
    return bindings;
  }
}

interface ITableBinding extends ITableTriggerTarget {
  readonly triggerName: string;
  readonly tableId: string;
}
