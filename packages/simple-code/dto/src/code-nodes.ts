import type { IDataInfo } from '@falang/dto';
import {
  action,
  cycle,
  functionCfg,
  getOutConfigSimple,
  getOutConfigWithData,
  ifCfg,
  NodesGroup,
  pseudoCycleCfg,
  switchCfg,
  zod,
} from '@falang/dto';

/**
 * Every editable field in the `code` domain is one raw, unvalidated source-code string typed
 * directly by the user in the document's target language — no parsing/type-checking, unlike
 * `@falang/typescript-dto`'s structured fields. Reused verbatim across action/if/switch/while/
 * foreach/function-header/function-footer, matching the old app's single `CodeBlockDto{code}`.
 */
export const codeDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

export const CODE_ROOT_NODE_NAME = 'code-function';

export const codeFunctionNodesGroup = new NodesGroup([
  action('action', codeDataType),
  getOutConfigSimple('break', 'break'),
  getOutConfigSimple('continue', 'continue'),
  getOutConfigWithData('return', 'return', codeDataType),
  getOutConfigWithData('throw', 'throw', codeDataType),
  ...functionCfg({
    name: CODE_ROOT_NODE_NAME,
    data: codeDataType,
    header: codeDataType,
    footer: codeDataType,
  }),
  ...ifCfg('if', codeDataType),
  cycle('foreach', codeDataType),
  cycle('while', codeDataType),
  pseudoCycleCfg('pseudo-cycle'),
  ...switchCfg({
    name: 'switch',
    data: codeDataType,
    optionData: codeDataType,
  }),
]);
