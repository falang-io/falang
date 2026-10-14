import type { DependencyContainer } from '@falang/di';
import type { TypescriptProjectService } from '../typescript-project-service/typescript-project.service.js';
import { buildModelText } from './model-text.js';

/** A field checked by the TypeScript language service: the exact text an editor model of that field would hold. */
export interface ICheckedCodeField {
  /** The block's field name (`'arr'`, `'value'`, `'parameters.x'`, …); `'value'` for a single-field block. */
  field: string;
  kind: 'code';
  prefix: string;
  value: string;
  suffix: string;
  /** An empty value is not checked (today `create-var`'s initial value). */
  allowEmpty?: boolean;
  /** Values (trimmed) that are valid but not valid TypeScript, e.g. `default` of a `switch` case. */
  skipValues?: readonly string[];
}

/** A field that declares a new identifier — checked synchronously, no Monaco involved. */
export interface ICheckedIdentifierField {
  field: string;
  kind: 'identifier';
  value: string;
  /** Names already declared in the enclosing scope. */
  scopeNames: string[];
}

export type ICheckedField = ICheckedCodeField | ICheckedIdentifierField;

export interface IFieldCheckContext {
  /** The project's types/functions/external-API registries; `null` when the scheme has none. */
  projectService: TypescriptProjectService | null;
  /**
   * The scheme's DI container, for describers of other packages that need a service of their own (e.g. workflow's
   * integrations registry). Absent in contexts built without a scheme; describers must cope with that.
   */
  container?: DependencyContainer | null;
}

export const getCodeFieldText = (field: ICheckedCodeField): string =>
  buildModelText(field.prefix, field.value, field.suffix);

/** Whether the field is left out of checking altogether. */
export const isCodeFieldSkipped = (field: ICheckedCodeField): boolean => {
  const trimmed = field.value.trim();
  if (field.allowEmpty && trimmed === '') return true;
  return field.skipValues?.includes(trimmed) ?? false;
};
