import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type TOptionsKind = 'question' | 'choice';

const kindIndex = new WeakMap<readonly IWorkflowIntegration[], ReadonlyMap<string, TOptionsKind>>();

const optionsKinds = (integrations: readonly IWorkflowIntegration[]): ReadonlyMap<string, TOptionsKind> => {
  let index = kindIndex.get(integrations);
  if (!index) {
    const map = new Map<string, TOptionsKind>();
    for (const integration of integrations) {
      for (const question of integration.questions ?? []) map.set(question.name, 'question');
      for (const choice of integration.choices ?? []) map.set(choice.name, 'choice');
    }
    index = map;
    kindIndex.set(integrations, index);
  }
  return index;
};

/**
 * A question's (`telegram-question`, `human-task`, …) header `data.options` drives its buttons, while the branches are
 * its `<name>-option` children — the editor keeps the two in sync (`@falang/workflow-scheme`'s
 * `buildOptionsFromChildren`), but an agent writing JSON can write them apart, and then a button matches no branch
 * (ADR 0062 (private): 9 of 240 real agent trees). On write the children win, as in the editor: a question's `options`
 * are its non-fixed children's labels (the fixed timeout branch is never a button), a choice's are its children's
 * whole data. Left untouched when a child has no usable data — validation reports that.
 */
export const syncOptionsFromChildren = (
  node: Record<string, unknown>,
  integrations: readonly IWorkflowIntegration[],
): void => {
  if (typeof node.name !== 'string' || !isRecord(node.data) || !Array.isArray(node.children)) return;
  const kind = optionsKinds(integrations).get(node.name);
  if (!kind) return;
  const children = node.children as unknown[];
  if (!children.every((child) => isRecord(child) && isRecord(child.data))) return;
  const childData = children.map((child) => (child as { data: Record<string, unknown> }).data);
  if (kind === 'choice') {
    node.data = { ...node.data, options: childData };
    return;
  }
  const labels = childData.filter((data) => data.fixed !== true).map((data) => data.label);
  if (!labels.every((label) => typeof label === 'string')) return;
  node.data = { ...node.data, options: labels };
};
