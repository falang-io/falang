import { resolveService } from '@falang/di';
import type { NodeStore } from '@falang/scheme';
import {
  identifierField,
  registerFieldDescriber,
  registerFieldDescriberResolver,
  scopeField,
  type IFieldCheckContext,
  type TFieldDescriber,
} from '@falang/typescript-scheme';
import { ACTIVEPIECES_ACTION_NAME } from '@falang/workflow-dto';
import {
  getChoiceHeaderFields,
  getQuestionHeaderFields,
  type IIntegrationInstance,
} from '@falang/workflow-integrations-common';
import { TOKEN_CREDENTIALS_PROVIDER, TOKEN_INTEGRATIONS_REGISTRY } from '../registry/di-tokens.js';
import type { IntegrationsRegistryStore } from '../registry/integrations-registry.store.js';
import { describeIntegrationFields, recordOf } from './describe-integration-fields.js';

/** The choice header's one node-wide variable name, when its options carry none (`ChoiceEditorStore`'s default). */
export const DEFAULT_CHOICE_VARIABLE_NAME = 'data';

const getRegistry = (ctx: IFieldCheckContext): IntegrationsRegistryStore | null => {
  if (!ctx.container) return null;
  try {
    return resolveService(TOKEN_INTEGRATIONS_REGISTRY, ctx.container);
  } catch {
    return null;
  }
};

const getInstances = (ctx: IFieldCheckContext): readonly IIntegrationInstance[] => {
  if (!ctx.container) return [];
  try {
    return resolveService(TOKEN_CREDENTIALS_PROVIDER, ctx.container).getInstances();
  } catch {
    return [];
  }
};

const describeAction: TFieldDescriber = (node, ctx) => {
  const descriptor = getRegistry(ctx)?.findAction(node.name);
  return descriptor ? describeIntegrationFields(node, ctx, descriptor.fields, node.data, getInstances(ctx)) : [];
};

const describeQuestion: TFieldDescriber = (node, ctx) => {
  const descriptor = getRegistry(ctx)?.findQuestion(node.name);
  return descriptor
    ? describeIntegrationFields(node, ctx, getQuestionHeaderFields(descriptor), node.data, getInstances(ctx))
    : [];
};

const describeChoice: TFieldDescriber = (node, ctx) => {
  const descriptor = getRegistry(ctx)?.findChoice(node.name);
  if (!descriptor) return [];
  const fields = describeIntegrationFields(node, ctx, getChoiceHeaderFields(descriptor), node.data, getInstances(ctx));
  const options = recordOf(node.data)['options'];
  const first = Array.isArray(options) ? recordOf(options[0])['variable'] : '';
  const variable = typeof first === 'string' && first !== '' ? first : DEFAULT_CHOICE_VARIABLE_NAME;
  return [...fields, identifierField(node, ctx, 'variable', variable)];
};

/**
 * `activepieces-action`: the node's props are only known once the (async) catalog is loaded, so the stored `propsValue`
 * entries are the field list — every prop is a bare-scope expression in the editor, and a prop with no stored value is
 * an empty (valid) one, so the two agree. The picker state (no piece/action chosen yet) has nothing to check.
 */
const describeActivepiecesAction: TFieldDescriber = (node, ctx) => {
  const data = recordOf(node.data);
  if (!data['pieceName'] || !data['actionName']) return [];
  return Object.entries(recordOf(data['propsValue'])).map(([name, value]) =>
    scopeField(node, ctx, name, typeof value === 'string' ? value : ''),
  );
};

const describeIntegrationNode = (node: NodeStore, ctx: IFieldCheckContext): TFieldDescriber | undefined => {
  const registry = getRegistry(ctx);
  if (!registry) return;
  if (registry.findAction(node.name)) return describeAction;
  if (registry.findQuestion(node.name)) return describeQuestion;
  if (registry.findChoice(node.name)) return describeChoice;
};

let registered = false;

/**
 * Registers the workflow blocks' field describers (ADR 0068 (private)): `activepieces-action` by name, every
 * vendor action/question/choice through a resolver — those node kinds exist per vendor and only the scheme's
 * integrations registry (`TOKEN_INTEGRATIONS_REGISTRY`, found through `ctx.container`) knows them. Idempotent.
 */
export const registerWorkflowFieldDescribers = (): void => {
  if (registered) return;
  registered = true;
  registerFieldDescriber(ACTIVEPIECES_ACTION_NAME, describeActivepiecesAction);
  registerFieldDescriberResolver({ resolve: (node, ctx) => describeIntegrationNode(node, ctx) });
};
