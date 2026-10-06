// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import {
  createFunctionNames,
  createTypeNames,
  type IProjectionContext,
  type ITypeNames,
} from '@falang/code-projection';
import { commentCfg, NodesGroup, NodesStack, type INode } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { activepiecesActionNodesGroup, magicNodesGroup, triggerFunctionNodesGroup } from '@falang/workflow-dto';
import {
  getChoiceNodeConfigs,
  getIntegrationNodeConfigs,
  getQuestionNodeConfigs,
  type IIntegrationInstance,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { IntegrationExtension } from './integration-extension.js';
import { uniqueIdentifiers, vendorNamespace } from './naming.js';

export interface IWorkflowProjectDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** The document's tree; absent for a never-edited document (its default tree is used). */
  readonly root?: INode | null;
}

export interface IWorkflowProjectInput {
  readonly documents: readonly IWorkflowProjectDocument[];
  readonly instances: readonly IIntegrationInstance[];
  readonly integrations: readonly IWorkflowIntegration[];
}

export interface IProjectedInstance {
  readonly instance: IIntegrationInstance;
  readonly identifier: string;
  readonly integration: IWorkflowIntegration;
}

const stacks = new WeakMap<readonly IWorkflowIntegration[], NodesStack>();

/** The workflow `function`/`trigger-function` stack — the same composition as the backend's MCP registry. */
export const workflowStack = (integrations: readonly IWorkflowIntegration[]): NodesStack => {
  const cached = stacks.get(integrations);
  if (cached) return cached;
  const stack = new NodesStack([
    functionNodesGroup,
    new NodesGroup(triggerFunctionNodesGroup),
    new NodesGroup(magicNodesGroup),
    new NodesGroup([commentCfg()]),
    new NodesGroup(activepiecesActionNodesGroup),
    new NodesGroup(getIntegrationNodeConfigs(integrations)),
    new NodesGroup(getQuestionNodeConfigs(integrations.flatMap((integration) => integration.questions ?? []))),
    new NodesGroup(getChoiceNodeConfigs(integrations.flatMap((integration) => integration.choices ?? []))),
  ]);
  stacks.set(integrations, stack);
  return stack;
};

/** `objects-structure` threads (interfaces) of a document: node id → interface name. */
export const projectStructs = (documents: readonly IWorkflowProjectDocument[]): Map<string, string> => {
  const structs = new Map<string, string>();
  for (const doc of documents) {
    if (doc.type !== 'objects-structure' || !doc.root) continue;
    const body = doc.root.children?.[1];
    for (const thread of body?.children ?? []) {
      if (typeof thread.data === 'string' && thread.data.trim() !== '') structs.set(thread.id, thread.data.trim());
    }
  }
  return structs;
};

/** Vendor struct ids (`telegram/Message`) → `telegram.TelegramMessage`. */
export const vendorStructs = (integrations: readonly IWorkflowIntegration[]): Map<string, string> => {
  const structs = new Map<string, string>();
  for (const integration of integrations) {
    for (const type of integration.types ?? [])
      structs.set(type.id, `${vendorNamespace(integration.vendor)}.${type.name}`);
  }
  return structs;
};

/** Everything the projection needs to know about one project, derived from its documents. */
export class WorkflowModel {
  readonly input: IWorkflowProjectInput;
  readonly stack: NodesStack;
  readonly types: ITypeNames;
  readonly instances: readonly IProjectedInstance[];
  readonly integrationsByVendor: ReadonlyMap<string, IWorkflowIntegration>;

  constructor(input: IWorkflowProjectInput) {
    this.input = input;
    this.stack = workflowStack(input.integrations);
    this.types = createTypeNames(new Map([...vendorStructs(input.integrations), ...projectStructs(input.documents)]));
    this.integrationsByVendor = new Map(input.integrations.map((integration) => [integration.vendor, integration]));
    const known = input.instances.filter((instance) => this.integrationsByVendor.has(instance.vendor));
    const reserved = new Set([
      ...input.integrations.map((integration) => vendorNamespace(integration.vendor)),
      ...input.documents.map((doc) => doc.name),
    ]);
    const identifiers = uniqueIdentifiers(
      known,
      (instance) => instance.name,
      (instance) => vendorNamespace(instance.vendor),
      reserved,
    );
    this.instances = known.map((instance) => ({
      identifier: identifiers.get(instance) as string,
      instance,
      integration: this.integrationsByVendor.get(instance.vendor) as IWorkflowIntegration,
    }));
  }

  instanceById(id: string): IProjectedInstance | undefined {
    return this.instances.find((entry) => entry.instance.id === id);
  }

  instanceByIdentifier(identifier: string): IProjectedInstance | undefined {
    return this.instances.find((entry) => entry.identifier === identifier);
  }

  context(): IProjectionContext {
    const functionDocs = this.input.documents.filter(
      (doc) => doc.type === 'function' || doc.type === 'trigger-function',
    );
    const names = createFunctionNames(functionDocs);
    const callable = createFunctionNames(this.input.documents.filter((doc) => doc.type === 'function'));
    return {
      extensions: [new IntegrationExtension(this)],
      functions: { idOf: (name) => callable.idOf(name), nameOf: (id) => names.nameOf(id) },
      stack: this.stack,
      types: this.types,
    };
  }
}
