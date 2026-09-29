import type { NodesGroup } from './nodes-group.js';
import type z from 'zod';
import { createZodUnion, getDocumentZod } from './zod-utils.js';
import type { INode, INodeConfig, INodeMeta } from './types.js';
import { defaultFactory } from './default-factory.js';
import type { IProjectDocument } from './project.js';

export type INodesGroupLike = Pick<NodesGroup<readonly INodeConfig[]>, 'list'>;

export class NodesStack {
  readonly groups: readonly INodesGroupLike[];
  readonly configsMap = new Map<string, INodeConfig>();

  private nodesZodUnion: z.ZodUnion;
  private documentsZod: z.ZodType;

  constructor(groups: readonly INodesGroupLike[]) {
    this.groups = groups;
    this.nodesZodUnion = createZodUnion(groups);
    this.documentsZod = getDocumentZod(this.nodesZodUnion);
    groups
      .flatMap((g) => g.list)
      .forEach((cfg) => {
        if (this.configsMap.has(cfg.name)) {
          throw new Error(`Duplicate node: ${cfg.name}`);
        }
        this.configsMap.set(cfg.name, cfg);
      });
  }

  parseNode(data: unknown): INode {
    return this.nodesZodUnion.parse(data) as INode;
  }

  parseDocument(data: unknown): IProjectDocument {
    return this.documentsZod.parse(data) as IProjectDocument;
  }

  factory(name: string, meta?: INodeMeta): INode {
    const cfg = this.configsMap.get(name);
    if (!cfg) {
      throw new Error(`Node not found: ${name}`);
    }
    let returnValue = cfg.factory ? cfg.factory() : defaultFactory(cfg);
    if (returnValue) {
      returnValue = {
        ...returnValue,
        meta: {
          ...returnValue.meta,
          ...meta,
        },
      };
    }
    return returnValue;
  }

  getConfig(name: string): INodeConfig {
    const cfg = this.configsMap.get(name);
    if (!cfg) {
      throw new Error(`Node not found: ${name}`);
    }
    return cfg;
  }
}
