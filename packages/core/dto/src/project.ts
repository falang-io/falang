import type zod from 'zod';
import type { NodesStack } from './nodes-stack.js';
import type { INode } from './types.js';

export type IDocumentGeneralType = 'scheme' | 'custom';

export interface IDocumentBaseConfig {
  typeName: string;
  type: IDocumentGeneralType;
}

export interface IDocumentSchemeConfig extends IDocumentBaseConfig {
  type: 'scheme';
  nodes: NodesStack;
}

export interface IDocumentCustomConfig<TCustomConfig = unknown> extends IDocumentBaseConfig {
  type: 'custom';
  data: TCustomConfig;
  dataZod: zod.ZodType<TCustomConfig>;
}

export type IDocumentConfig = IDocumentSchemeConfig | IDocumentCustomConfig;

export interface IProjectConfig {
  typeName: string;
  documents: IDocumentConfig[];
}

export interface IProjectTreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** Set only on a fixed root section folder (workflow projects, ADR 0055 (private)); a domain-defined kind string. */
  fixedKind?: string | null;
}

export interface IProjectTreeDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  /** True for the project's singleton, non-deletable, non-movable documents (e.g. `integrations`). */
  pinned?: boolean;
}

export interface IProjectDocument {
  id: string;
  type: string;
  name: string;
  /**
   * For scheme types
   */
  root?: INode;
  /**
   * For custom types
   */
  data?: unknown;
}
