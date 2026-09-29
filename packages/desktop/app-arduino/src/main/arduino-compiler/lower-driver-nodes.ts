import type { INode, IProjectDocument } from '@falang/dto';
import type { IDriverConfig } from '../../shared/driver-config.js';
import { parseDriverActionNodeName } from '../../shared/driver-node-name.js';
import { substituteDriverTemplate } from './substitute-driver-template.js';
import { driverResultTypeToVariableType } from './driver-result-type.js';

export interface ILowerDriverNodesResult {
  readonly documents: IProjectDocument[];
  /** Every driver id actually referenced by at least one node — `compileArduinoProject` only `#include`s/copies these (see ADR 0023 (private)'s Implementation notes). */
  readonly usedDriverIds: ReadonlySet<string>;
}

/**
 * Desugars every `driver-action::{driverId}::{actionId}` node into a plain `action`/`create-var` node
 * — the same lowering shape `lower-pin-nodes.ts` established, extended to a runtime-discovered driver
 * registry instead of four fixed kinds. Thrown errors (unknown driver/action — e.g. a project authored
 * against a driver that's since been uninstalled) surface as a normal `NodeCompileError`-free `Error`,
 * caught by `compileArduinoProject`'s caller the same way any other pre-compile failure is.
 */
export const lowerDriverNodes = (
  documents: readonly IProjectDocument[],
  drivers: readonly IDriverConfig[],
): ILowerDriverNodesResult => {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const usedDriverIds = new Set<string>();

  const lowerNode = (node: INode): INode => {
    const parsed = parseDriverActionNodeName(node.name);
    if (!parsed) return node.children ? { ...node, children: node.children.map((child) => lowerNode(child)) } : node;

    const driver = driversById.get(parsed.driverId);
    if (!driver) throw new Error(`Unknown driver "${parsed.driverId}" referenced by node ${node.id} — is it still installed?`);
    const driverAction = driver.actions.find((action) => action.id === parsed.actionId);
    if (!driverAction) {
      throw new Error(`Driver "${parsed.driverId}" has no action "${parsed.actionId}" (node ${node.id})`);
    }
    usedDriverIds.add(driver.id);

    const data = (node.data ?? {}) as Readonly<Record<string, string>>;
    const code = substituteDriverTemplate(driverAction, data);
    const newVariableField = driverAction.fields.find((field) => field.kind === 'new-variable');

    if (newVariableField && driverAction.resultType) {
      const variableName = data[newVariableField.name] || newVariableField.default || 'result';
      return {
        id: node.id,
        name: 'create-var',
        data: { name: variableName, variableType: driverResultTypeToVariableType(driverAction.resultType), value: code },
      };
    }
    return { id: node.id, name: 'action', data: code };
  };

  const lowered = documents.map((document): IProjectDocument =>
    document.root ? { ...document, root: lowerNode(document.root) } : document,
  );
  return { documents: lowered, usedDriverIds };
};
