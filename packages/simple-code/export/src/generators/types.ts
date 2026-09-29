import type { INode } from '@falang/dto';
import type { CodeBuilder } from '../code-builder.js';

export interface IGeneratorParams {
  readonly node: INode;
  /** `node.data` as a string (`?? ''`) — every `code` domain node's data is a raw string. */
  readonly data: string;
  readonly builder: CodeBuilder;
  /** Recursion seam, same role as the old app's `generateIcon` callback. */
  readonly generateNode: (node: INode) => void;
}

export type TNodeGenerator = (params: IGeneratorParams) => void;

export type TCodeNodeKind =
  | 'action'
  | 'if'
  | 'switch'
  | 'while'
  | 'foreach'
  | 'pseudo-cycle'
  | 'function'
  | 'break'
  | 'continue'
  | 'return'
  | 'throw';

export interface ICodeGeneratorConfig {
  readonly commentLinePrefix: string;
  /** php only: `'<?php'` */
  readonly fileStart?: string;
  /** php only: `'?>'` */
  readonly fileEnd?: string;
  readonly nodes: Record<TCodeNodeKind, TNodeGenerator>;
}
