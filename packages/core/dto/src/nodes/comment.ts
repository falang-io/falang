import { z } from 'zod';
import type { IDataInfo, INodeConfig } from '../types.js';

export const COMMENT_NAME = 'comment';

const commentDataType = {
  type: z
    .string()
    .describe('Comment text (plain text, may span several lines). Compiles to a code comment, never to code.'),
  default: () => '',
} as const satisfies IDataInfo;

/**
 * A comment: a leaf statement holding plain text, drawn as a sheet with a folded corner. Domain-neutral —
 * a host adds it to its stack and its compiler emits the text as a code comment (or nothing).
 */
export const commentCfg = <TName extends string = typeof COMMENT_NAME>(name: TName = COMMENT_NAME as TName) =>
  ({ name, data: commentDataType }) as const satisfies INodeConfig;
