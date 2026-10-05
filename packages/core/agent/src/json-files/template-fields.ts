import type { NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';

/**
 * How `@falang/workflow-integrations-common`'s `describeFieldForAgent` describes a `template-string` field in a node
 * kind's JSON Schema. Matched on the schema rather than imported, so this package stays domain-neutral: any kind whose
 * data property is described this way gets its stray surrounding backticks stripped on write (ADR 0062 §2.2).
 */
const TEMPLATE_FIELD_DESCRIPTION = /body of a JavaScript template literal/;

const cache = new WeakMap<NodesStack, Map<string, readonly string[]>>();

/** The `data` properties of `kind` that hold the body of a template literal (none for a non-object `data`). */
export const templateFieldsOf = (kind: string, stack: NodesStack): readonly string[] => {
  let perStack = cache.get(stack);
  if (!perStack) {
    perStack = new Map();
    cache.set(stack, perStack);
  }
  const cached = perStack.get(kind);
  if (cached) return cached;
  const dataType = stack.configsMap.get(kind)?.data?.type;
  let fields: string[] = [];
  if (dataType) {
    try {
      const schema = zod.toJSONSchema(dataType) as { properties?: Record<string, { description?: unknown }> };
      fields = Object.entries(schema.properties ?? {})
        .filter(([, prop]) => typeof prop.description === 'string' && TEMPLATE_FIELD_DESCRIPTION.test(prop.description))
        .map(([name]) => name);
    } catch {
      fields = [];
    }
  }
  perStack.set(kind, fields);
  return fields;
};
