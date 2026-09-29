import type { TTypeInfo } from './dtos/types.js';

/**
 * Renders a TS literal expression that's a safe initial value for a variable of the given type,
 * so `create-var` never compiles to a bare `let x: T;` left as `undefined` at runtime (struct/array
 * fields accessed before assignment throw `Cannot read properties of undefined`). Returns
 * `undefined` when no generic default can be synthesized: `enum` member values live in another
 * document not visible here, and `any`/`void`/`never` have no meaningful value.
 */
export const defaultValueExpression = (type: TTypeInfo): string | undefined => {
  switch (type.type) {
    case 'string': {
      return "''";
    }
    case 'boolean': {
      return 'false';
    }
    case 'number': {
      return '0';
    }
    case 'array': {
      return '[]';
    }
    case 'struct': {
      return '{}';
    }
    case 'union': {
      const [first] = type.unionTypes;
      return first && defaultValueExpression(first);
    }
    default: {
      // oxlint-disable-next-line no-undefined -- explicit "no default" signal, distinct from any produced expression string
      return undefined;
    }
  }
};
