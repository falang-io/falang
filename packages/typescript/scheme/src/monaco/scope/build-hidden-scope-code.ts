import type { TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import type { IScopeVariable, TScopeVariableType } from '@falang/typescript-common';
import type {
  ITypeRegistryObjectItem,
  TypesRegistryStore,
} from '../../typescript-project-service/types-registry.store.js';

const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const sanitizeIdentifier = (value: string): string => {
  const cleaned = value.replaceAll(/[^a-zA-Z0-9_$]/g, '_');
  const withLeadingLetter = IDENTIFIER_RE.test(cleaned) ? cleaned : `_${cleaned}`;
  return withLeadingLetter.length > 0 ? withLeadingLetter : '_';
};

const toInterfaceName = (item: ITypeRegistryObjectItem): string => {
  const base = sanitizeIdentifier(item.name || item.id);
  return base.charAt(0).toUpperCase() + base.slice(1);
};

const formatPropertyKey = (name: string): string => (IDENTIFIER_RE.test(name) ? name : JSON.stringify(name));

const collectStructIds = (type: TVariableInfo, ids: Set<string>): void => {
  if (type.type === 'struct') {
    ids.add(type.id);
  } else if (type.type === 'array') {
    collectStructIds(type.elementType, ids);
  } else if (type.type === 'union') {
    type.unionTypes.forEach((unionType) => collectStructIds(unionType, ids));
  }
};

const resolveStructTypes = (
  rootIds: Iterable<string>,
  typesRegistry: TypesRegistryStore,
): Map<string, ITypeRegistryObjectItem> => {
  const resolved = new Map<string, ITypeRegistryObjectItem>();
  const pending = [...rootIds];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || resolved.has(id)) continue;
    const item = typesRegistry.types.get(id);
    if (!item) continue;
    resolved.set(id, item);
    const nestedIds = new Set<string>();
    Object.values(item.properties).forEach((propertyType) => collectStructIds(propertyType, nestedIds));
    nestedIds.forEach((nestedId) => pending.push(nestedId));
  }
  return resolved;
};

const buildStructNames = (structs: Map<string, ITypeRegistryObjectItem>): Map<string, string> => {
  const structNames = new Map<string, string>();
  const usedNames = new Set<string>();
  [...structs.values()]
    .toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .forEach((item) => {
      let name = toInterfaceName(item);
      while (usedNames.has(name)) {
        name = `${name}_${item.id.slice(0, 4)}`;
      }
      usedNames.add(name);
      structNames.set(item.id, name);
    });
  return structNames;
};

/** Like `variableInfoToTsType`, but also accepts a raw `typeof`-based type query for scope variables. */
const scopeVariableTypeToTsType = (type: TScopeVariableType, structNames: Map<string, string>): string =>
  type.type === 'raw' ? type.expression : variableInfoToTsType(type, structNames);

/**
 * Builds the source of the hidden preamble prepended to a monaco model: `interface` declarations
 * for every struct type reachable from `variables`, followed by a `declare const` per variable.
 * Reused by every code-editing block that needs the enclosing function's parameters/create-var
 * variables to be known to the TypeScript language service without exposing them to the user.
 */
export const buildHiddenScopeCode = (variables: IScopeVariable[], typesRegistry: TypesRegistryStore | null): string => {
  if (variables.length === 0) return '';

  const rootIds = new Set<string>();
  variables.forEach((variable) => {
    if (variable.type.type !== 'raw') collectStructIds(variable.type, rootIds);
  });

  const structs = typesRegistry
    ? resolveStructTypes(rootIds, typesRegistry)
    : new Map<string, ITypeRegistryObjectItem>();
  const structNames = buildStructNames(structs);

  const lines: string[] = [];
  structNames.forEach((name, id) => {
    const item = structs.get(id);
    if (!item) return;
    lines.push(`interface ${name} {`);
    Object.entries(item.properties).forEach(([propName, propType]) => {
      lines.push(`  ${formatPropertyKey(propName)}: ${variableInfoToTsType(propType, structNames)};`);
    });
    lines.push('}');
  });

  const uniqueVariables = new Map<string, IScopeVariable>();
  variables.forEach((variable) => uniqueVariables.set(variable.name, variable));
  uniqueVariables.forEach((variable) => {
    lines.push(
      `declare ${variable.type.constant ? 'const' : 'var'} ${variable.name}: ${scopeVariableTypeToTsType(variable.type, structNames)};`,
    );
  });

  if (lines.length === 0) return '';
  return `${lines.join('\n')}\n`;
};
