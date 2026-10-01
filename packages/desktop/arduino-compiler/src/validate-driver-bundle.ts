import {
  ARDUINO_BUILTIN_DECLARATIONS,
  DriverBundleValidationError,
  parseDevicesDocumentData,
  parseDriverBundle,
  type IDriverBundle,
  type IDriverConfig,
} from '@falang/desktop-arduino-dto';
import { declaredName, templatesStage, buildSyntheticSketch } from './driver-template-check.js';
import { usagesStage } from './driver-usages.js';
import type {
  IDriverValidationIssue,
  IDriverValidationResult,
  IValidateDriverBundleContext,
} from './driver-validation-types.js';

/** `validateDriverBundle` — ADR 0054 (private) §4; the stage implementations live in `driver-template-check.ts`/`driver-usages.ts`, the shared types in `driver-validation-types.ts`. */

const collisionStage = (
  config: IDriverConfig,
  ctx: IValidateDriverBundleContext,
): { errors: IDriverValidationIssue[]; warnings: IDriverValidationIssue[] } => {
  const errors: IDriverValidationIssue[] = [];
  const warnings: IDriverValidationIssue[] = [];
  const owners = new Map<string, string>();
  for (const declaration of ARDUINO_BUILTIN_DECLARATIONS) {
    const name = declaredName(declaration);
    if (name) owners.set(name, 'the Arduino built-ins');
  }
  for (const other of ctx.otherDrivers) {
    if (other.id === config.id) continue;
    for (const declaration of other.declarations) {
      const name = declaredName(declaration);
      if (name && !owners.has(name)) owners.set(name, `driver "${other.id}"`);
    }
  }
  const seen = new Set<string>();
  for (const declaration of config.declarations) {
    const name = declaredName(declaration);
    if (!name) continue;
    if (seen.has(name)) {
      errors.push({ stage: 'collisions', message: `"${name}" is declared more than once by this driver` });
    }
    seen.add(name);
    const owner = owners.get(name);
    if (owner)
      errors.push({
        stage: 'collisions',
        message: `"${name}" is already declared by ${owner} — prefix this driver's functions uniquely`,
      });
  }
  if (ctx.otherDrivers.some((other) => other.id === config.id && other.scope === 'bundled')) {
    warnings.push({
      stage: 'collisions',
      message: `driver "${config.id}" overrides the built-in driver with the same id`,
    });
  }
  return { errors, warnings };
};

/** The parsed bundle, or the stage-1 issues. */
const tryParseBundle = (input: unknown): IDriverBundle | IDriverValidationIssue[] => {
  try {
    return parseDriverBundle(input);
  } catch (error) {
    if (!(error instanceof DriverBundleValidationError)) throw error;
    return error.messages.map((message) => ({ stage: 'schema' as const, message }));
  }
};

const failure = (errors: IDriverValidationIssue[], warnings: IDriverValidationIssue[]): IDriverValidationResult => ({
  ok: false,
  errors,
  warnings,
});

export const validateDriverBundle = async (
  input: unknown,
  ctx: IValidateDriverBundleContext,
): Promise<IDriverValidationResult> => {
  const parsed = tryParseBundle(input);
  if (Array.isArray(parsed)) return failure(parsed, []);
  const bundle = parsed as IDriverBundle;
  const warnings: IDriverValidationIssue[] = [];

  const collisions = collisionStage(bundle.config, ctx);
  warnings.push(...collisions.warnings);
  if (collisions.errors.length > 0) return failure(collisions.errors, warnings);

  const templateErrors = templatesStage(bundle.config);
  if (templateErrors.length > 0) return failure(templateErrors, warnings);

  if (ctx.project) {
    const devicesData = ctx.project.devicesData ? parseDevicesDocumentData(ctx.project.devicesData) : null;
    const usageErrors = usagesStage(bundle.config, { documents: ctx.project.documents, devicesData });
    if (usageErrors.length > 0) return failure(usageErrors, warnings);
  }
  // The slow arduino-cli stage runs last, after every cheap deterministic check passed.
  if (ctx.runCliCheck) {
    const cli = await ctx.runCliCheck(buildSyntheticSketch(bundle));
    warnings.push(...(cli.warnings ?? []).map((message) => ({ stage: 'cli' as const, message })));
    if (cli.errors && cli.errors.length > 0) {
      return failure(
        cli.errors.map((message) => ({ stage: 'cli' as const, message })),
        warnings,
      );
    }
  }

  return { ok: true, errors: [], warnings };
};
