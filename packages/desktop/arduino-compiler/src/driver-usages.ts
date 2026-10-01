import type { INode } from '@falang/dto';
import {
  DEVICES_DOCUMENT_TYPE,
  parseDriverActionNodeName,
  type IDriverConfig,
  type IDriverFieldDescriptor,
} from '@falang/desktop-arduino-dto';
import type { IDriverUsage, IDriverValidationIssue, IDriverValidationProject } from './driver-validation-types.js';

const walk = (node: INode, visit: (node: INode) => void): void => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
  for (const mod of node.mods ?? []) walk(mod, visit);
  if (node.out) walk(node.out, visit);
};

/** Every `driver-action::<id>::*` node and `Devices` instance of driver `id` in the project — what blocks a delete. */
export const findDriverUsages = (id: string, project: IDriverValidationProject): IDriverUsage[] => {
  const usages: IDriverUsage[] = [];
  for (const document of project.documents) {
    if (!document.root) continue;
    walk(document.root, (node) => {
      const parsed = parseDriverActionNodeName(node.name);
      if (parsed?.driverId === id) {
        usages.push({ kind: 'node', documentId: document.id, nodeId: node.id, actionId: parsed.actionId });
      }
    });
  }
  const devicesDocument = project.documents.find((document) => document.type === DEVICES_DOCUMENT_TYPE);
  for (const device of project.devicesData?.devices ?? []) {
    if (device.driverId === id) {
      usages.push({ kind: 'device', documentId: devicesDocument?.id ?? '', instanceId: device.id });
    }
  }
  return usages;
};

/** Problems with one field value against its descriptor: absent without default, or a select value that is no longer an option. */
const fieldProblem = (field: IDriverFieldDescriptor, value: string | undefined): string | null => {
  if (field.kind === 'new-variable') return null;
  const effective = value ?? field.default ?? '';
  if (effective === '') {
    return field.kind === 'string' ? null : `field "${field.name}" has no value and no default`;
  }
  if (field.kind === 'select' && !field.options?.some((option) => option.value === effective)) {
    return `field "${field.name}" value "${effective}" is not one of the options`;
  }
  return null;
};

export const usagesStage = (config: IDriverConfig, project: IDriverValidationProject): IDriverValidationIssue[] => {
  const issues: IDriverValidationIssue[] = [];
  for (const usage of findDriverUsages(config.id, project)) {
    if (usage.kind === 'node') {
      const action = config.actions.find((a) => a.id === usage.actionId);
      if (!action) {
        issues.push({
          stage: 'usages',
          message: `action "${usage.actionId ?? ''}" no longer exists but node ${usage.nodeId ?? ''} still uses it`,
          action: usage.actionId,
          documentId: usage.documentId,
          nodeId: usage.nodeId,
        });
        continue;
      }
      const document = project.documents.find((d) => d.id === usage.documentId);
      let data: Record<string, string> = {};
      if (document?.root) {
        walk(document.root, (node) => {
          if (node.id === usage.nodeId) data = (node.data ?? {}) as Record<string, string>;
        });
      }
      for (const field of action.fields) {
        const problem = fieldProblem(field, data[field.name]);
        if (problem) {
          issues.push({
            stage: 'usages',
            message: `${problem} (action "${action.id}")`,
            action: action.id,
            documentId: usage.documentId,
            nodeId: usage.nodeId,
          });
        }
      }
      continue;
    }
    const instance = project.devicesData?.devices.find((d) => d.id === usage.instanceId);
    if (!config.device) {
      issues.push({
        stage: 'usages',
        message: `device "${instance?.name ?? ''}" uses this driver but it has no "device" section any more`,
        action: 'device',
        documentId: usage.documentId,
      });
      continue;
    }
    for (const field of config.device.fields) {
      const problem = fieldProblem(field, instance?.params[field.name]);
      if (problem) {
        issues.push({
          stage: 'usages',
          message: `device "${instance?.name ?? ''}": ${problem}`,
          action: 'device',
          documentId: usage.documentId,
        });
      }
    }
  }
  return issues;
};
