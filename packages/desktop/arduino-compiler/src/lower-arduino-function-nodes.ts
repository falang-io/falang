import type { INode, IProjectDocument } from '@falang/dto';
import { int32Type } from '@falang/typescript-dto';
import {
  DELAY,
  DELAY_MICROSECONDS,
  MICROS,
  MILLIS,
  RANDOM,
  RANDOM_SEED,
  SERIAL_BEGIN,
  SERIAL_PRINT,
  SERIAL_PRINTLN,
  type IRandomData,
  type ISingleNumberActionData,
  type IZeroArgReadData,
} from '@falang/desktop-arduino-dto';

/**
 * Desugars the nine Arduino built-in-function node kinds into the plain `action`/`create-var` nodes
 * `@falang/logic-constructor` already knows how to compile — the same "lowering pass, not a new node
 * kind inside the shared compiler" approach `lower-pin-nodes.ts` already established (see
 * ADR 0023 (private)'s "Decision"). A `millis`/`micros`/`random` node becomes a `create-var` typed
 * `int32Type`, matching those calls' own declared `number` return type in `ARDUINO_BUILTIN_DECLARATIONS`.
 */
const lowerNode = (node: INode): INode => {
  switch (node.name) {
    case DELAY: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `delay(${data.value})` };
    }
    case DELAY_MICROSECONDS: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `delayMicroseconds(${data.value})` };
    }
    case RANDOM_SEED: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `randomSeed(${data.value})` };
    }
    case SERIAL_BEGIN: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `Serial.begin(${data.value})` };
    }
    case SERIAL_PRINT: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `Serial.print(${data.value})` };
    }
    case SERIAL_PRINTLN: {
      const data = node.data as ISingleNumberActionData;
      return { id: node.id, name: 'action', data: `Serial.println(${data.value})` };
    }
    case MILLIS: {
      const data = node.data as IZeroArgReadData;
      return {
        id: node.id,
        name: 'create-var',
        data: { name: data.variable, variableType: int32Type, value: 'millis()' },
      };
    }
    case MICROS: {
      const data = node.data as IZeroArgReadData;
      return {
        id: node.id,
        name: 'create-var',
        data: { name: data.variable, variableType: int32Type, value: 'micros()' },
      };
    }
    case RANDOM: {
      const data = node.data as IRandomData;
      return {
        id: node.id,
        name: 'create-var',
        data: { name: data.variable, variableType: int32Type, value: `random(${data.max})` },
      };
    }
    default: {
      return node.children ? { ...node, children: node.children.map((child) => lowerNode(child)) } : node;
    }
  }
};

export const lowerArduinoFunctionNodesInDocument = (document: IProjectDocument): IProjectDocument =>
  document.root ? { ...document, root: lowerNode(document.root) } : document;

export const lowerArduinoFunctionNodes = (documents: readonly IProjectDocument[]): IProjectDocument[] =>
  documents.map((document) => lowerArduinoFunctionNodesInDocument(document));
