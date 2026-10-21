// oxlint-disable no-console
import { resolveService } from '@falang/di';
import { ValidationModule, type INodeValidator, type IValidationContext, type TIssueDraft } from '@falang/scheme';
import { validateVariableName } from '../block-elements/new-variable/validate-variable-name.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../typescript-project-service/typescript-project.service.token.js';
import type { TypescriptProjectService } from '../typescript-project-service/typescript-project.service.js';
import { getCodeFieldText, isCodeFieldSkipped, type ICheckedField } from './checked-field.js';
import { describeCheckedFields } from './describe-checked-fields.js';
import { createPortableTypesValidator } from '../portable-types/portable-types-validator.js';
import { MonacoCheckPool } from './monaco-check-pool.js';

export const TYPESCRIPT_VALIDATION_SOURCE = 'typescript';

/** Appended to an error that falls on a hidden line: the forced type or a scope declaration, not the typed text. */
export const HIDDEN_LINE_NOTE = " (does not match the field's expected type or scope)";

let defaultPool: MonacoCheckPool | null = null;

/** The window-wide pool (one model). Created on first use. */
export const getDefaultCheckPool = (): MonacoCheckPool => {
  defaultPool ??= new MonacoCheckPool();
  return defaultPool;
};

export interface ITsFieldsValidatorOptions {
  /** Defaults to `getDefaultCheckPool()`. */
  pool?: MonacoCheckPool;
  /** Also check that types are compilable by the portable targets (ADR 0069 (private)); a no-op unless the project is in `portable` number mode. */
  portableTypes?: boolean;
}

const resolveProjectService = (ctx: IValidationContext): TypescriptProjectService | null => {
  try {
    return resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, ctx.scheme.container);
  } catch {
    return null;
  }
};

/**
 * `source: 'typescript'` validator (ADR 0068 (private)): `describe` returns the node's checked fields (the exact text
 * an editor model of each field would hold), `check` sends the code fields through a `MonacoCheckPool` and checks
 * identifier fields synchronously. Without an installed Monaco (a headless host) code fields are skipped — one warning.
 */
export const createTypescriptFieldsValidator = (
  options: ITsFieldsValidatorOptions = {},
): INodeValidator<ICheckedField[]> => {
  let warned = false;
  const getPool = () => options.pool ?? getDefaultCheckPool();
  return {
    source: TYPESCRIPT_VALIDATION_SOURCE,
    describe(node, ctx) {
      const fields = describeCheckedFields(node, {
        projectService: resolveProjectService(ctx),
        container: ctx.scheme.container,
      });
      const available = getPool().isAvailable();
      const relevant = fields.filter((field) =>
        field.kind === 'identifier' ? true : available && !isCodeFieldSkipped(field),
      );
      return relevant.length > 0 ? relevant : null;
    },
    async check(fields) {
      const pool = getPool();
      const drafts: TIssueDraft[] = [];
      for (const field of fields) {
        if (field.kind === 'identifier') {
          const message = validateVariableName(field.value, field.scopeNames);
          if (message) drafts.push({ field: field.field, message, severity: 'error' });
          continue;
        }
        if (!pool.isAvailable()) {
          if (!warned) {
            warned = true;
            console.warn('[validation] Monaco is not installed — TypeScript field checks are skipped');
          }
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: the pool is a shared single worker
        const diagnostics = await pool.check(getCodeFieldText(field), {
          prefixLength: field.prefix.length,
          valueLength: field.value.length,
        });
        // One issue per field and region keeps a broken scope from flooding the node's tooltip.
        const seenRegions = new Set<string | undefined>();
        for (const diagnostic of diagnostics) {
          if (seenRegions.has(diagnostic.region)) continue;
          seenRegions.add(diagnostic.region);
          drafts.push({
            field: field.field,
            message: diagnostic.region === 'value' ? diagnostic.message : `${diagnostic.message}${HIDDEN_LINE_NOTE}`,
            severity: 'error',
          });
        }
      }
      return drafts;
    },
  };
};

/** The validators of a TypeScript scheme — pass to `ValidationModule({ validators })`. */
export const createTypescriptValidators = (options: ITsFieldsValidatorOptions = {}): INodeValidator[] => [
  createTypescriptFieldsValidator(options) as INodeValidator,
  ...(options.portableTypes ? [createPortableTypesValidator() as INodeValidator] : []),
];

/** `new ValidationModule` with the TypeScript field validator, wired in one line by a host. */
export const createTypescriptValidationModule = (options: ITsFieldsValidatorOptions = {}): ValidationModule =>
  new ValidationModule({ validators: createTypescriptValidators(options) });
