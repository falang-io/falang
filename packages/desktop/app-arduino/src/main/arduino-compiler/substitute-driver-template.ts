import type { IDriverActionDescriptor, IDriverFieldDescriptor } from '../../shared/driver-config.js';

/**
 * Wraps a "string"-kind field's raw value in a real TS template literal — backslash and `` ` `` are
 * the only two characters that would otherwise break out of it; a `${expr}` sequence the user typed is
 * left untouched on purpose, since the whole point is for it to survive as a genuine interpolation.
 * The substituted-in placeholder (`${text}` etc. — a driver author's own `codeTemplate` syntax, not
 * this) ends up embedded inside a lowered `action`/`create-var` node's `data`, which is later
 * re-parsed and type-checked as ordinary TS by `compileExpr` (`@falang/logic-constructor`'s
 * `ts.Program`-based pipeline) — so a value like `Привет, ${name}` becomes a real
 * `TemplateExpression`, compiled per target by `walk-expression.ts`'s own template-literal handling
 * (`ILanguageAdapter.emitTemplateLiteral`), the same way any other TS expression is.
 */
// oxlint-disable-next-line unicorn/prefer-string-raw -- `String.raw` can't represent a single trailing backslash (the template-literal lexer treats `\`` as an escaped backtick regardless of the tag function), so a lone backslash needs the ordinary escape below.
const BACKSLASH = '\\';
export const toTsTemplateLiteral = (value: string): string =>
  `\`${value.replaceAll(BACKSLASH, BACKSLASH + BACKSLASH).replaceAll('`', `${BACKSLASH}\``)}\``;

/**
 * Substitutes every non-`new-variable` field's value into `template`'s `${name}` placeholders — see
 * `driver-config.ts`'s field-kind doc comments for the substitution rule per kind. `data` is a flat
 * `Record<string, string>` — either a `driver-action::…` node's own `data` (see `driver-node-configs.ts`)
 * or, since ADR 0032 (private), a `Devices` document's device
 * instance `params` (see `setup-prologue.ts`); a field with no entry in `data` falls back to its own
 * `default` (matches every field always being present in practice, since both writers always populate
 * every field, but keeps this pure function total). Generalized from a single `action.codeTemplate`
 * caller to also serve a driver's `device.setupTemplate` — see `substituteDriverTemplate` below for the
 * original, still-`IDriverActionDescriptor`-shaped signature `lower-driver-nodes.ts` keeps using.
 *
 * Substitutes in a single pass over `template` itself, matching every `${name}` placeholder once
 * against a precomputed name→value map, rather than one `replaceAll` per field run sequentially over
 * an accumulating `code` string — a "string"-kind field's own value can now legitimately contain a
 * `${expr}` interpolation (see `toTsTemplateLiteral` above), and a sequential-`replaceAll` version
 * would risk a *later* field's own placeholder substitution reaching back into text an *earlier*
 * field's value already inserted (e.g. an action with fields `row`/`text` where a user's message
 * happens to interpolate a same-named scope variable, `` `Row: ${row}` ``, would have its `${row}`
 * corrupted by the driver's own `row` field substitution). A single pass over the original
 * placeholder text can't do that: `String.prototype.replaceAll` with a global regex never rescans
 * text a replacement just inserted.
 */
export const substituteTemplate = (
  template: string,
  fields: readonly IDriverFieldDescriptor[],
  data: Readonly<Record<string, string>>,
): string => {
  const values = new Map<string, string>();
  for (const field of fields) {
    if (field.kind === 'new-variable') continue;
    const raw = data[field.name] ?? field.default ?? '';
    values.set(field.name, field.kind === 'string' ? toTsTemplateLiteral(raw) : raw);
  }
  return template.replaceAll(/\$\{([a-zA-Z_]\w*)\}/g, (match: string, name: string) => values.get(name) ?? match);
};

/** Thin wrapper over `substituteTemplate` for an action's own `codeTemplate` — kept as its own function (rather than inlining `substituteTemplate(action.codeTemplate, action.fields, data)` at every call site) so `lower-driver-nodes.ts` didn't need to change when `substituteTemplate` was generalized. */
export const substituteDriverTemplate = (
  action: IDriverActionDescriptor,
  data: Readonly<Record<string, string>>,
): string => substituteTemplate(action.codeTemplate, action.fields, data);
