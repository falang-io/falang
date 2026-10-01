import z from 'zod';
import type { INodeConfig } from './types.js';

/**
 * Union of every config's `mods` list — the "mod-only" kinds (ADR 0049 (private)). A kind named here
 * is only ever valid inside a host's `mods` array, never as a `children` statement. Throws on a name
 * that has no config in the same stack.
 */
export const collectModKindNames = (configs: readonly INodeConfig[]): ReadonlySet<string> => {
  const known = new Set(configs.map((c) => c.name));
  const result = new Set<string>();
  for (const cfg of configs) {
    for (const name of cfg.mods ?? []) {
      if (!known.has(name)) throw new Error(`Unknown mod kind "${name}" in mods of node "${cfg.name}"`);
      result.add(name);
    }
  }
  return result;
};

type TValidatorLookup = (name: string) => z.ZodType;

/** The `mods` field of a host validator: only the host's listed kinds, or nothing at all. */
export const buildModsField = (cfg: INodeConfig, lookup: TValidatorLookup) => {
  const allowed = cfg.mods ?? [];
  if (allowed.length === 0) return z.optional(z.array(z.never()));
  return z.optional(
    z.array(
      z.lazy(() =>
        z.discriminatedUnion('name', allowed.map((name) => lookup(name)) as unknown as [z.core.$ZodTypeDiscriminable]),
      ),
    ),
  );
};

/** `.check()` callback rejecting two mods of the same kind on one host (at most one per kind). */
export const checkUniqueMods = (ctx: z.core.ParsePayload<unknown>): void => {
  const value = ctx.value as { mods?: readonly { name: string }[] };
  const seen = new Set<string>();
  value.mods?.forEach((mod, index) => {
    if (seen.has(mod.name)) {
      ctx.issues.push({
        code: 'custom',
        input: value,
        message: `A node may have at most one "${mod.name}" mod.`,
        path: ['mods', index],
      });
    }
    seen.add(mod.name);
  });
};

/** Extra fields that make a mod-kind validator reject children/out/mods (a mod is a leaf annotation). */
export const modKindLeafFields = {
  children: z.optional(z.array(z.never())),
  mods: z.optional(z.array(z.never())),
  out: z.optional(z.never()),
};
