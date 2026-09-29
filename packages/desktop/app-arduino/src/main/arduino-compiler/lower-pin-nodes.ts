import type { INode, IProjectDocument } from '@falang/dto';
import { int32Type } from '@falang/typescript-dto';
import {
  PIN_READ_ANALOG,
  PIN_READ_DIGITAL,
  PIN_WRITE_ANALOG,
  PIN_WRITE_DIGITAL,
  type IPinReadData,
  type IPinWriteAnalogData,
  type IPinWriteDigitalData,
} from '../../shared/pin-nodes.js';

/**
 * Desugars the four pin node kinds into the plain `action`/`create-var` nodes `@falang/logic-constructor`
 * already knows how to compile — see ADR 0023 (private)'s "Decision" for why this lowering pass
 * (not a new node kind inside the shared compiler) is how pin icons reach real code: it keeps
 * `@falang/logic-constructor` unaware that "Arduino" or "pins" exist at all, the same posture
 * ADR 0020 (private) already established for `arduinoAdapter`/`ARDUINO_BUILTIN_DECLARATIONS`.
 * A `pin-read-*` node becomes a `create-var` typed `int32Type` (matching `digitalRead`/`analogRead`'s
 * own declared `number` return type in `ARDUINO_BUILTIN_DECLARATIONS`) rather than something narrower
 * like `boolean` — keeps the lowered code trivially valid C++ without a cast.
 */
const lowerNode = (node: INode): INode => {
  switch (node.name) {
    case PIN_WRITE_DIGITAL: {
      const data = node.data as IPinWriteDigitalData;
      return { id: node.id, name: 'action', data: `digitalWrite(${data.pin}, ${data.value ? 'HIGH' : 'LOW'})` };
    }
    case PIN_WRITE_ANALOG: {
      const data = node.data as IPinWriteAnalogData;
      return { id: node.id, name: 'action', data: `analogWrite(${data.pin}, ${data.value})` };
    }
    case PIN_READ_DIGITAL: {
      const data = node.data as IPinReadData;
      return {
        id: node.id,
        name: 'create-var',
        data: { name: data.variable, variableType: int32Type, value: `digitalRead(${data.pin})` },
      };
    }
    case PIN_READ_ANALOG: {
      const data = node.data as IPinReadData;
      return {
        id: node.id,
        name: 'create-var',
        data: { name: data.variable, variableType: int32Type, value: `analogRead(A${data.pin})` },
      };
    }
    default: {
      return node.children ? { ...node, children: node.children.map((child) => lowerNode(child)) } : node;
    }
  }
};

export const lowerPinNodesInDocument = (document: IProjectDocument): IProjectDocument =>
  document.root ? { ...document, root: lowerNode(document.root) } : document;

export const lowerPinNodes = (documents: readonly IProjectDocument[]): IProjectDocument[] =>
  documents.map((document) => lowerPinNodesInDocument(document));
