import type { IDataInfo } from '@falang/dto';
import {
  action,
  cycle,
  functionCfg,
  getOutConfigSimple,
  getOutConfigWithData,
  ifCfg,
  NodesGroup,
  parallelCfg,
  pseudoCycleCfg,
  switchCfg,
  zod,
} from '@falang/dto';
import { arrPopDataType } from './dtos/arr-pop.dto.js';
import { arrPushDataType } from './dtos/arr-push.dto.js';
import { arrShiftDataType } from './dtos/arr-shift.dto.js';
import { arrInsertDataType } from './dtos/arr-insert.dto.js';
import { arrSliceDataType } from './dtos/arr-slice.dto.js';
import { arrUnshiftDataType } from './dtos/arr-unshift.dto.js';
import { callApiDataType } from './dtos/call-api.dto.js';
import { callFunctionDataType } from './dtos/call-function.dto.js';
import { foreachHeaderDataType } from './dtos/foreach-header.dto.js';
import { fromToCycleHeaderDataType } from './dtos/from-to-cycle-header.dto.js';
import { functionBodyDataType } from './dtos/function-body.dto.js';
import { createVarDataType } from './dtos/create-var.dto.js';

const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

/**
 * `log`'s message is the *body* of a template literal (the editor's `TemplateStringStore` and every
 * compiler add the backticks themselves), not a TypeScript expression like every other string field
 * here — `description` flows into `get_node_kinds`' JSON Schema so an LLM agent doesn't wrap it in
 * backticks itself (see `@falang/workflow-integrations-common`'s `describeFieldForAgent`).
 */
const logMessageDataType = {
  type: zod
    .string()
    .describe(
      'Log message text, compiled as the body of a template literal: do NOT wrap it in backticks or quotes ' +
        '(they are added automatically). Insert runtime values with `${expr}`, e.g. `count = ${count}`.',
    ),
  default: () => '',
} as const satisfies IDataInfo;

export const functionNodesGroup = new NodesGroup([
  action('create-var', createVarDataType),
  action('action', stringDataType),
  getOutConfigSimple('break', 'break'),
  getOutConfigSimple('continue', 'continue'),
  getOutConfigWithData('throw', 'throw', stringDataType),
  getOutConfigWithData('return', 'return', stringDataType),
  ...functionCfg({
    name: 'function',
    data: functionBodyDataType,
    footer: stringDataType,
    header: stringDataType,
  }),
  ...ifCfg('if', stringDataType),
  cycle('foreach', foreachHeaderDataType),
  cycle('from-to-cycle', fromToCycleHeaderDataType),
  cycle('while', stringDataType),
  pseudoCycleCfg('pseudo-cycle'),
  ...parallelCfg('parallel'),
  ...switchCfg({
    name: 'switch',
    data: stringDataType,
    optionData: stringDataType,
  }),
  action('call-function', callFunctionDataType),
  action('call-api', callApiDataType),
  action('log', logMessageDataType),

  action('arr-pop', arrPopDataType),
  action('arr-push', arrPushDataType),
  action('arr-shift', arrShiftDataType),
  action('arr-insert', arrInsertDataType),
  action('arr-slice', arrSliceDataType),
  action('arr-unshift', arrUnshiftDataType),
]);
