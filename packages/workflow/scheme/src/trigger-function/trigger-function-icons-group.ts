import { getFunctionIconConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { textBlockConfig } from '@falang/typescript-scheme';
import { TRIGGER_FUNCTION_NAME, triggerFunctionNodesGroup } from '@falang/workflow-dto';
import { triggerFunctionBodyBlockConfig } from './trigger-function-body.block.config.js';

/**
 * `getFunctionIconConfig` also emits `trigger-function-header`/`trigger-function-footer` entries —
 * unused (the actual child nodes are named `function-header`/`function-footer`, reused verbatim from
 * the plain-function icons group, see `trigger-function-nodes.ts`) but harmless orphan keys, since
 * `SchemeInfrastructure` merges icon configs by name rather than validating them against a group's
 * own node list.
 */
export const buildTriggerFunctionIconsGroup = () =>
  new IconsGroup(
    new NodesGroup(triggerFunctionNodesGroup),
    getFunctionIconConfig({
      name: TRIGGER_FUNCTION_NAME,
      header: textBlockConfig,
      body: triggerFunctionBodyBlockConfig,
      footer: textBlockConfig,
    }),
  );
