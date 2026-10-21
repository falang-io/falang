// oxlint-disable no-undefined -- `field` is absent when the node's data is itself the type
import { resolveService } from '@falang/di';
import {
  TOKEN_I18N,
  ValidationModule,
  type INodeValidator,
  type IValidationContext,
  type TIssueDraft,
} from '@falang/scheme';
import { toJS } from 'mobx';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../typescript-project-service/typescript-project.service.token.js';

export const PORTABLE_TYPES_VALIDATION_SOURCE = 'portable-types';

export type TPortableTypeProblem = 'number-any' | 'any' | 'enum';

export interface IPortableTypeIssue {
  /** Top-level key of the node's data the offending type sits in (`variableType`, `parameters`, `returnValue`, …). */
  field?: string;
  problem: TPortableTypeProblem;
  message: string;
}

const ENGLISH: Record<TPortableTypeProblem, string> = {
  'number-any': "Choose integer, float or decimal — `number` without a kind can't be compiled to C++, Go, Rust or C#.",
  any: "The `any` type can't be compiled to C++, Go, Rust or C# — choose a concrete type.",
  enum: "The `enum` type isn't supported by the C++, Go, Rust and C# targets — choose another type.",
};

const TYPE_INFO_KEYS = new Set(['type', 'optional', 'constant']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What is wrong with `value` if it is a type that no non-TypeScript target can compile, else `null`. */
const problemOf = (value: Record<string, unknown>): TPortableTypeProblem | null => {
  if (value.type === 'number' && isRecord(value.numberType) && value.numberType.type === 'any') return 'number-any';
  if (value.type === 'any' && Object.keys(value).every((key) => TYPE_INFO_KEYS.has(key))) return 'any';
  if (value.type === 'enum' && typeof value.schemeId === 'string' && typeof value.iconId === 'string') return 'enum';
  return null;
};

/**
 * Every offending type found anywhere inside `data` (`variableType`, parameter lists, `returnValue`, array
 * `elementType`, `unionTypes`, …), once per (top-level field, problem).
 */
export const findPortableTypeProblems = (data: unknown): { field?: string; problem: TPortableTypeProblem }[] => {
  const found: { field?: string; problem: TPortableTypeProblem }[] = [];
  const seen = new Set<string>();
  const add = (field: string | undefined, problem: TPortableTypeProblem) => {
    const key = `${field ?? ''}|${problem}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ field, problem });
  };
  const walk = (value: unknown, field: string | undefined, depth: number) => {
    if (depth > 12) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, field, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    const problem = problemOf(value);
    if (problem) add(field, problem);
    for (const [key, child] of Object.entries(value)) {
      // `numberType: { type: 'any' }` is the detail of a number, not a general `any` (already reported as `number-any`).
      if (key !== 'numberType') walk(child, field, depth + 1);
    }
  };
  const plain = toJS(data);
  if (isRecord(plain)) {
    const own = problemOf(plain);
    if (own) add(undefined, own);
    for (const [key, child] of Object.entries(plain)) if (key !== 'numberType') walk(child, key, 0);
  } else {
    walk(plain, undefined, 0);
  }
  return found;
};

const translate = (ctx: IValidationContext, problem: TPortableTypeProblem): string => {
  try {
    // `t` is observable: reading it here makes a language change re-describe every node.
    const t = resolveService(TOKEN_I18N, ctx.scheme.container).t as unknown as (
      key: string,
      options?: Record<string, unknown>,
    ) => string;
    const key = `portable-types:${problem}`;
    const translated = t(key, { defaultValue: ENGLISH[problem] });
    return translated === key ? ENGLISH[problem] : translated;
  } catch {
    return ENGLISH[problem];
  }
};

/**
 * `source: 'portable-types'` validator (ADR 0069 (private)): an error on every type in a node's data that C++/Go/Rust/C#
 * can't compile — `number` of no kind, the general `any`, `enum`. Active only in a project in `portable` number mode.
 * Stored documents are never rewritten; the user picks the type.
 */
export const createPortableTypesValidator = (): INodeValidator<IPortableTypeIssue[]> => ({
  source: PORTABLE_TYPES_VALIDATION_SOURCE,
  describe(node, ctx) {
    let portable = false;
    try {
      portable = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, ctx.scheme.container).numberTypesMode === 'portable';
    } catch {
      portable = false;
    }
    if (!portable) return null;
    const problems = findPortableTypeProblems(node.data);
    if (problems.length === 0) return null;
    return problems.map((p) => ({ field: p.field, problem: p.problem, message: translate(ctx, p.problem) }));
  },
  check(issues): TIssueDraft[] {
    return issues.map((issue) => ({ field: issue.field, message: issue.message, severity: 'error' as const }));
  },
});

/** A validation module with only the portable-types validator (struct and external-API documents). */
export const createPortableTypesValidationModule = (): ValidationModule =>
  new ValidationModule({ validators: [createPortableTypesValidator() as INodeValidator] });
