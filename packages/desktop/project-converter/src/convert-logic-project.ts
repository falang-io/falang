import { nanoid } from 'nanoid';
import type { INode, IProjectDocument } from '@falang/dto';
import { ENUM_STRUCTURE_NAME, EXTERNAL_API_STRUCTURE_NAME, OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { convertStatement, fixFirstStatementOut } from './convert-common.js';
import { convertVariableInfo } from './variable-type.js';
import { createLogicContext, finalizeFunctionBody, iconOrBlockText } from './convert-logic-leaf.js';
import type { IOldScheme } from './old-types.js';

const convertFunctionDocument = (
  scheme: IOldScheme,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): IProjectDocument => {
  const root = scheme.root;
  if (root.alias !== 'function')
    throw new Error(`Expected a "function" root icon in logic-domain document ${scheme.id}, got "${root.alias}"`);
  const block = root.block;
  if (!block?.name) throw new Error(`Old "function" node ${root.id} is missing "block.name"`);

  const parameters = (block.parameters ?? []).map((parameter) => ({
    name: parameter.name,
    type: convertVariableInfo(parameter.type),
  }));
  const returnValue = block.returnValue ? convertVariableInfo(block.returnValue) : null;
  const hasReturnValue = returnValue !== null && returnValue.type !== 'void';

  const context = createLogicContext(hasReturnValue ? returnValue : null, rootIdToDocumentId);
  const statements = fixFirstStatementOut(
    (root.children ?? []).flatMap((child) => convertStatement(child, context)),
    'function-body',
  );
  const body = finalizeFunctionBody(statements, hasReturnValue);

  const rootNode: INode = {
    id: root.id,
    name: 'function',
    children: [
      { id: nanoid(), name: 'function-header', data: root.header?.text ?? '' },
      {
        id: nanoid(),
        name: 'function-body',
        data: { parameters, ...(returnValue ? { returnValue } : {}) },
        children: body,
      },
      { id: nanoid(), name: 'function-footer', data: root.footer?.text ?? '' },
    ],
  };
  return { id: scheme.id, type: 'function', name: scheme.name, root: rootNode };
};

const convertObjectsStructureDocument = (scheme: IOldScheme): IProjectDocument => {
  const root = scheme.root;
  if (root.alias !== 'tree')
    throw new Error(`Expected a "tree" root icon in "object_definition" document ${scheme.id}, got "${root.alias}"`);

  const threads: INode[] = (root.children ?? []).map((structIcon) => {
    const properties: INode[] = (structIcon.children ?? []).map((propertyIcon) => {
      const propertyBlock = propertyIcon.block;
      if (!propertyBlock?.name || !propertyBlock.variableType)
        throw new Error(`Old object property ${propertyIcon.id} is missing "block.name"/"block.variableType"`);
      return {
        id: propertyIcon.id,
        name: `${OBJECTS_STRUCTURE_NAME}-child`,
        data: { name: propertyBlock.name, variableType: convertVariableInfo(propertyBlock.variableType) },
        children: [],
      };
    });
    return {
      id: structIcon.id,
      name: `${OBJECTS_STRUCTURE_NAME}-thread`,
      data: structIcon.block?.text ?? '',
      children: properties,
    };
  });

  const rootNode: INode = {
    id: root.id,
    name: OBJECTS_STRUCTURE_NAME,
    children: [
      {
        id: nanoid(),
        name: `${OBJECTS_STRUCTURE_NAME}-header`,
        data: iconOrBlockText(root.header) || (root.block?.text ?? ''),
      },
      { id: nanoid(), name: `${OBJECTS_STRUCTURE_NAME}-body`, data: null, children: threads },
    ],
  };
  return { id: scheme.id, type: OBJECTS_STRUCTURE_NAME, name: scheme.name, root: rootNode };
};

const convertExternalApiStructureDocument = (scheme: IOldScheme): IProjectDocument => {
  const root = scheme.root;
  if (root.alias !== 'logic_external_apis')
    throw new Error(`Expected a "logic_external_apis" root icon in document ${scheme.id}, got "${root.alias}"`);

  const threads: INode[] = (root.children ?? []).map((endpointIcon) => {
    const items: INode[] = (endpointIcon.children ?? []).map((itemIcon) => {
      const itemBlock = itemIcon.block;
      if (!itemBlock?.name) throw new Error(`Old external-api item ${itemIcon.id} is missing "block.name"`);
      return {
        id: itemIcon.id,
        name: `${EXTERNAL_API_STRUCTURE_NAME}-child`,
        data: {
          name: itemBlock.name,
          parameters: (itemBlock.parameters ?? []).map((parameter) => ({
            name: parameter.name,
            type: convertVariableInfo(parameter.type),
          })),
          ...(itemBlock.returnValue ? { returnValue: convertVariableInfo(itemBlock.returnValue) } : {}),
        },
        children: [],
      };
    });
    const headBlock = endpointIcon.block;
    if (!headBlock?.name) throw new Error(`Old external-api endpoint ${endpointIcon.id} is missing "block.name"`);
    return {
      id: endpointIcon.id,
      name: `${EXTERNAL_API_STRUCTURE_NAME}-thread`,
      data: { name: headBlock.name },
      children: items,
    };
  });

  const rootNode: INode = {
    id: root.id,
    name: EXTERNAL_API_STRUCTURE_NAME,
    children: [
      { id: nanoid(), name: `${EXTERNAL_API_STRUCTURE_NAME}-header`, data: iconOrBlockText(root.header) },
      { id: nanoid(), name: `${EXTERNAL_API_STRUCTURE_NAME}-body`, data: null, children: threads },
    ],
  };
  return { id: scheme.id, type: EXTERNAL_API_STRUCTURE_NAME, name: scheme.name, root: rootNode };
};

/**
 * Best-effort — no real `logic_enum` sample exists anywhere in `old/resources` (see
 * `old-types.ts`'s module doc); modelled by analogy with `object_definition`/`logic_external_apis`
 * (same old `InfrastructureType`/mind-tree-shaped editor) and the old app's own
 * `EnumHeadBlockDto{name,valueType}`/`EnumItemBlockDto{key,value}` (`old/packages/infrastructure/
 * logic/src/logic_enum/blocks/`), which line up with the new `enumHeadDto`/`enumItemDto` unchanged.
 */
const convertEnumStructureDocument = (scheme: IOldScheme): IProjectDocument => {
  const root = scheme.root;
  if (root.alias !== 'logic_enum')
    throw new Error(`Expected a "logic_enum" root icon in document ${scheme.id}, got "${root.alias}"`);

  const threads: INode[] = (root.children ?? []).map((enumIcon) => {
    const items: INode[] = (enumIcon.children ?? []).map((itemIcon) => {
      const itemBlock = itemIcon.block as unknown as { key?: string | number; value?: string | number } | undefined;
      const hasKey = typeof itemBlock?.key === 'string' || typeof itemBlock?.key === 'number';
      const hasValue = typeof itemBlock?.value === 'string' || typeof itemBlock?.value === 'number';
      if (!hasKey || !hasValue) throw new Error(`Old enum item ${itemIcon.id} is missing "block.key"/"block.value"`);
      return {
        id: itemIcon.id,
        name: `${ENUM_STRUCTURE_NAME}-child`,
        data: { key: itemBlock.key as string | number, value: itemBlock.value as string | number },
        children: [],
      };
    });
    const headBlock = enumIcon.block as unknown as { name?: string; valueType?: string } | undefined;
    if (!headBlock?.name || !headBlock.valueType)
      throw new Error(`Old enum ${enumIcon.id} is missing "block.name"/"block.valueType"`);
    return {
      id: enumIcon.id,
      name: `${ENUM_STRUCTURE_NAME}-thread`,
      data: { name: headBlock.name, valueType: headBlock.valueType },
      children: items,
    };
  });

  const rootNode: INode = {
    id: root.id,
    name: ENUM_STRUCTURE_NAME,
    children: [
      { id: nanoid(), name: `${ENUM_STRUCTURE_NAME}-header`, data: iconOrBlockText(root.header) },
      { id: nanoid(), name: `${ENUM_STRUCTURE_NAME}-body`, data: null, children: threads },
    ],
  };
  return { id: scheme.id, type: ENUM_STRUCTURE_NAME, name: scheme.name, root: rootNode };
};

export const convertLogicDocument = (
  scheme: IOldScheme,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): IProjectDocument => {
  switch (scheme.type) {
    case 'function': {
      return convertFunctionDocument(scheme, rootIdToDocumentId);
    }
    case 'object_definition': {
      return convertObjectsStructureDocument(scheme);
    }
    case 'logic_external_apis': {
      return convertExternalApiStructureDocument(scheme);
    }
    case 'logic_enum': {
      return convertEnumStructureDocument(scheme);
    }
    default: {
      throw new Error(
        `Unsupported old document type for a logic-domain project: "${scheme.type}" (document ${scheme.id})`,
      );
    }
  }
};
