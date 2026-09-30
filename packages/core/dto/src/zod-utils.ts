import z from 'zod';
import type { INodesGroupLike } from './nodes-stack.js';
import { buildModsField, checkUniqueMods, collectModKindNames, modKindLeafFields } from './zod-mods.js';

const zodMeta = z.record(
  z.string(),
  z.lazy((): z.ZodUnion => z.union([z.string(), z.boolean(), z.number(), zodMeta, z.array(zodMeta)])),
);

export const zodNodeBase = z.object({
  id: z.string(),
  name: z.string(),
  meta: z.optional(zodMeta),
});

export const createZodUnion = (groups: readonly INodesGroupLike[]): z.ZodUnion => {
  const allNodes = groups.flatMap((g) => g.list);
  const validatorsMap = new Map<string, z.ZodType>();
  const modKindNames = collectModKindNames(allNodes);
  const lookupValidator = (name: string): z.ZodType => {
    const item = validatorsMap.get(name);
    if (!item) throw new Error(`Node not found in map: ${name}`);
    return item;
  };
  // `children: true` means "any *statement* node", not "any node in the stack" — a `documentRootOnly`
  // kind (e.g. `function`, `trigger-function`) may still be the document's own `root`, validated against
  // the unfiltered `union` below via `getDocumentZod`, but must never be accepted as a nested child.
  // Built lazily (and memoized) since `validatorsMap` isn't fully populated until every entry of
  // `allNodes` below has been visited once.
  // `excludeChildren` (a per-config list) narrows it further; one memoized union per distinct exclusion set.
  const statementUnions = new Map<string, z.ZodUnion>();
  const getStatementUnion = (exclude: readonly string[] = []): z.ZodUnion => {
    const key = exclude.toSorted().join('\u0000');
    let cached = statementUnions.get(key);
    if (!cached) {
      cached = z.discriminatedUnion(
        'name',
        allNodes
          .filter(
            (nodeConfig) =>
              !nodeConfig.documentRootOnly && !modKindNames.has(nodeConfig.name) && !exclude.includes(nodeConfig.name),
          )
          .map((nodeConfig) => {
            const item = validatorsMap.get(nodeConfig.name);
            if (!item) throw new Error(`Node not found in map: ${nodeConfig.name}`);
            return item;
          }) as unknown as [z.core.$ZodTypeDiscriminable],
        // zod >=4.6: a ZodDiscriminatedUnion is no longer assignable to ZodUnion; the cast keeps our public type.
      ) as unknown as z.ZodUnion;
      statementUnions.set(key, cached);
    }
    return cached;
  };
  const union = z.discriminatedUnion(
    'name',
    allNodes.map((nodeConfig) => {
      let validator = zodNodeBase.extend({
        name: z.literal(nodeConfig.name),
      });
      const hasChildrenPolicy =
        nodeConfig.children === true || Array.isArray(nodeConfig.children) || Array.isArray(nodeConfig.childTuple);
      if (nodeConfig.data) {
        validator = validator.extend({
          data: nodeConfig.data.type,
        });
      }
      if (nodeConfig.children === true) {
        validator = validator.extend({
          children: z.array(z.lazy(() => getStatementUnion(nodeConfig.excludeChildren))),
        });
      } else if (Array.isArray(nodeConfig.children)) {
        const children = nodeConfig.children;
        validator = validator.extend({
          children: z.array(
            z.lazy(() =>
              z.discriminatedUnion(
                'name',
                children.map((name) => {
                  const item = validatorsMap.get(name);
                  if (!item) throw new Error(`Node not found in map: ${name}`);
                  return item;
                }) as unknown as [z.core.$ZodTypeDiscriminable],
              ),
            ),
          ),
        });
      } else if (Array.isArray(nodeConfig.childTuple)) {
        const children = nodeConfig.childTuple;
        validator = validator.extend({
          children: z.tuple(
            children.map((name) =>
              z.lazy(() => {
                const item = validatorsMap.get(name);
                if (!item) throw new Error(`Node not found in map: ${name}`);
                return item;
              }),
            ) as unknown as [z.core.SomeType],
          ),
        });
      }
      if (modKindNames.has(nodeConfig.name)) {
        // A mod kind is a leaf annotation: no children, no out, no mods of its own (ADR 0049 (private)).
        validator = validator.extend(modKindLeafFields);
      } else {
        validator = validator.extend({
          mods: buildModsField(nodeConfig, lookupValidator),
          out: z.optional(z.lazy(() => union)),
        });
        if (nodeConfig.mods && nodeConfig.mods.length > 0) validator = validator.check(checkUniqueMods);
      }
      // Universal rule: whatever the children policy (`children: true`, a named array, or a
      // `childTuple`), `children[0]` must never carry an `out` node (break/continue/return/throw).
      // This is exactly what the renderer already does — `SkewerStore.isFirst` (`@falang/scheme`'s
      // `skewer/skewer.store.ts`) starts `true` and is only ever flipped to `false` for a non-first
      // thread (`threads/update-threads-child-positions.ts`), so `hasOutError` (the red box drawn
      // under an out-icon, `skewer.cmp.tsx`) fires on *any* out attached to the first-drawn chain,
      // including a plain sequential body or a cycle — not just a branching node's first branch. This
      // check mirrors that unconditionally, on every validator that declares children at all. Enforced
      // here, on the *parent's* own validator, rather than on the shared child config (e.g. `if-child`)
      // — the same child config is reused for every slot and has no way to know which one it occupies.
      // `.check()` (not `.refine()`) adds the validation without wrapping the schema in a new type, so
      // it stays a plain `ZodObject` usable as a `discriminatedUnion` member.
      if (hasChildrenPolicy) {
        const parentName = nodeConfig.name;
        validator = validator.check((ctx) => {
          const value = ctx.value as { children?: readonly { out?: unknown }[] };
          const firstChild = value.children?.[0];
          if (firstChild?.out) {
            ctx.issues.push({
              code: 'custom',
              message:
                `The first child of "${parentName}" continues the main execution path (the scheme draws it ` +
                `going straight down), so it must not have an "out" node (break/continue/return/throw). Move ` +
                `the child that needs the jump to a later position instead (for "if", swap the two branches ` +
                `and flip meta.trueOnRight, which keeps the exact same semantics).`,
              input: value,
              path: ['children', 0, 'out'],
            });
          }
        });
      }
      validatorsMap.set(nodeConfig.name, validator);
      return validator;
    }) as unknown as [z.core.$ZodTypeDiscriminable],
    // zod >=4.6: a ZodDiscriminatedUnion is no longer assignable to ZodUnion; the cast keeps our public type.
  ) as unknown as z.ZodUnion;
  return union;
};

export const getDocumentZod = (nodesUnion: z.ZodUnion) =>
  z.object({
    id: z.string(),
    name: z.string(),
    root: nodesUnion,
  });
