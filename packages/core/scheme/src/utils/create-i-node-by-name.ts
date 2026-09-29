import type { INodeMeta } from '@falang/dto';
import type { Scheme } from '../scheme/scheme.js';

export const createINodeByName = (name: string, scheme: Scheme, meta?: INodeMeta) =>
  scheme.infra.structure.factory(name, meta);
