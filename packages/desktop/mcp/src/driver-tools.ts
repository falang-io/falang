import { promises as fs } from 'node:fs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { configFilePath, listTree, readDocument } from '@falang/desktop-project-fs';
import {
  DEFAULT_BOARD_FQBN,
  deleteDriverDir,
  DEVICES_DOCUMENT_TYPE,
  parseDevicesDocumentData,
  parseDriverBundle,
  readDriverBundle,
  writeDriverBundle,
  type IDriverBundle,
  type IDriverConfig,
} from '@falang/desktop-arduino-dto';
import {
  createArduinoCliDriverCheck,
  findDriverUsages,
  validateDriverBundle,
  type IDriverCliCheckResult,
  type IDriverValidationProject,
  type IDriverValidationResult,
} from '@falang/desktop-arduino-compiler';
import type { ArduinoDriversState, TDriverScope } from './arduino-drivers-state.js';
import { handleGetDevices, handleSetDevices } from './devices-tools.js';
import { errorResult, jsonResult, messageOf } from './tool-results.js';

type TEditScope = 'project' | 'library';

/**
 * The Arduino-only driver tools of ADR 0054 (private) §7 — registered by `server.ts` only for an `'arduino'`
 * project (they know `falang/drivers/`, the library and `arduino-cli`, none of which `@falang/mcp-core`'s shared
 * tools should). Handlers never throw: a bad call comes back as a tool-result error.
 */
export interface IDriverToolContext {
  readonly projectDir: string;
  readonly state: ArduinoDriversState;
  /** Stage-4 hook for a board; `false` disables the `arduino-cli` stage (tests). Defaults to the real one, memoized per fqbn. */
  readonly cliCheckFor: (
    fqbn: string,
  ) => ((files: Readonly<Record<string, string>>) => Promise<IDriverCliCheckResult>) | null;
}

export const createCliCheckFactory = (): IDriverToolContext['cliCheckFor'] => {
  const checks = new Map<string, ReturnType<typeof createArduinoCliDriverCheck>>();
  return (fqbn) => {
    let check = checks.get(fqbn);
    if (!check) {
      check = createArduinoCliDriverCheck({ fqbn });
      checks.set(fqbn, check);
    }
    return check;
  };
};

const summarize = (config: IDriverConfig) => ({
  actions: config.actions.map((action) => ({
    fields: action.fields.map((field) => ({ kind: field.kind, name: field.name })),
    id: action.id,
    label: action.label,
    ...(action.notes ? { notes: action.notes } : {}),
    ...(action.resultType ? { resultType: action.resultType } : {}),
  })),
  ...(config.device
    ? { device: { fields: config.device.fields.map((field) => ({ kind: field.kind, name: field.name })) } }
    : {}),
  id: config.id,
  label: config.label,
  ...(config.notes ? { notes: config.notes } : {}),
});

export const handleListDrivers = (ctx: IDriverToolContext): CallToolResult => {
  const { state } = ctx;
  const effective = new Set(state.drivers.map((driver) => `${driver.scope}:${driver.config.id}`));
  return jsonResult({
    drivers: [
      ...state.all.map((driver) => ({
        ...summarize(driver.config),
        ...(driver.overrides ? { overrides: driver.overrides } : {}),
        effective: effective.has(`${driver.scope}:${driver.config.id}`),
        scope: driver.scope,
        status: 'ok',
      })),
      ...state.brokenDrivers.map((broken) => ({
        id: broken.id,
        message: broken.message,
        scope: broken.scope,
        status: 'load-error',
      })),
    ],
    libraryConfigured: state.libraryDir !== null,
  });
};

export const handleGetDriver = async (
  ctx: IDriverToolContext,
  args: { id: string; scope?: TDriverScope },
): Promise<CallToolResult> => {
  const driver = ctx.state.lookup(args.id, args.scope ?? null);
  if (!driver) return errorResult(`get_driver: no driver "${args.id}"${args.scope ? ` in scope ${args.scope}` : ''}`);
  try {
    return jsonResult({ bundle: await readDriverBundle(driver.dir), scope: driver.scope });
  } catch (error) {
    return errorResult(`get_driver: ${messageOf(error)}`);
  }
};

const readBoardFqbn = async (projectDir: string): Promise<string> => {
  try {
    const raw = JSON.parse(await fs.readFile(configFilePath(projectDir, 'arduino.json'), 'utf8')) as {
      board?: unknown;
    };
    return typeof raw.board === 'string' && raw.board !== '' ? raw.board : DEFAULT_BOARD_FQBN;
  } catch {
    return DEFAULT_BOARD_FQBN;
  }
};

const readProjectContext = async (projectDir: string): Promise<IDriverValidationProject> => {
  const tree = await listTree(projectDir);
  const documents = await Promise.all(tree.documents.map((doc) => readDocument(projectDir, doc.id)));
  const devices = documents.find((document) => document.type === DEVICES_DOCUMENT_TYPE);
  let devicesData = null;
  if (devices?.data) {
    try {
      devicesData = parseDevicesDocumentData(devices.data);
    } catch {
      devicesData = null;
    }
  }
  return { devicesData, documents };
};

const validateFor = async (
  ctx: IDriverToolContext,
  bundle: unknown,
  scope: TEditScope,
): Promise<IDriverValidationResult> => {
  const { state } = ctx;
  if (scope === 'library' && state.libraryDir === null) {
    return {
      errors: [{ message: 'no personal driver library is configured for this MCP server', stage: 'schema' }],
      ok: false,
      warnings: [],
    };
  }
  const otherDrivers: (IDriverConfig & { scope: TDriverScope })[] = [];
  for (const driver of state.all) {
    if (driver.scope === 'bundled' || driver.scope === scope)
      otherDrivers.push({ ...driver.config, scope: driver.scope });
  }
  const cliCheck = ctx.cliCheckFor(scope === 'project' ? await readBoardFqbn(ctx.projectDir) : DEFAULT_BOARD_FQBN);
  return validateDriverBundle(bundle, {
    otherDrivers,
    ...(scope === 'project' ? { project: await readProjectContext(ctx.projectDir) } : {}),
    ...(cliCheck ? { runCliCheck: cliCheck } : {}),
  });
};

const validationResult = (validation: IDriverValidationResult, extra: object = {}): CallToolResult => {
  const body = jsonResult({ ...extra, ...validation });
  return validation.ok ? body : { ...body, isError: true };
};

export const handleValidateDriver = async (
  ctx: IDriverToolContext,
  args: { bundle: unknown; scope: TEditScope },
): Promise<CallToolResult> => {
  try {
    return validationResult(await validateFor(ctx, args.bundle, args.scope));
  } catch (error) {
    return errorResult(`validate_driver: ${messageOf(error)}`);
  }
};

const saveBundle = async (ctx: IDriverToolContext, bundle: unknown, scope: TEditScope): Promise<CallToolResult> => {
  const validation = await validateFor(ctx, bundle, scope);
  if (!validation.ok) return validationResult(validation, { written: false });
  const parsed: IDriverBundle = parseDriverBundle(bundle);
  const dir = ctx.state.scopeDir(scope);
  if (dir === null) return errorResult('no personal driver library is configured for this MCP server');
  await fs.mkdir(dir, { recursive: true });
  const written = await writeDriverBundle(dir, parsed);
  await ctx.state.reload();
  return validationResult(validation, { id: parsed.config.id, path: written, scope, written: true });
};

export const handleSetDriver = async (
  ctx: IDriverToolContext,
  args: { bundle: unknown; scope: TEditScope },
): Promise<CallToolResult> => {
  try {
    return await saveBundle(ctx, args.bundle, args.scope);
  } catch (error) {
    return errorResult(`set_driver: ${messageOf(error)}`);
  }
};

export const handleUseLibraryDriver = async (
  ctx: IDriverToolContext,
  args: { id: string },
): Promise<CallToolResult> => {
  const driver = ctx.state.lookup(args.id, 'library');
  if (!driver) return errorResult(`use_library_driver: no driver "${args.id}" in the library`);
  try {
    return await saveBundle(ctx, await readDriverBundle(driver.dir), 'project');
  } catch (error) {
    return errorResult(`use_library_driver: ${messageOf(error)}`);
  }
};

export const handleDeleteDriver = async (
  ctx: IDriverToolContext,
  args: { id: string; scope: TEditScope },
): Promise<CallToolResult> => {
  const { state } = ctx;
  const dir = state.scopeDir(args.scope);
  if (dir === null) return errorResult('delete_driver: no personal driver library is configured for this MCP server');
  const driver = state.lookup(args.id, args.scope);
  if (!driver) return errorResult(`delete_driver: no driver "${args.id}" in the ${args.scope}`);
  try {
    if (args.scope === 'project' && !driver.overrides) {
      const usages = findDriverUsages(args.id, await readProjectContext(ctx.projectDir));
      if (usages.length > 0) {
        return {
          ...jsonResult({
            deleted: false,
            message: `driver "${args.id}" is still used — remove those nodes/Devices entries first`,
            usages,
          }),
          isError: true,
        };
      }
    }
    await deleteDriverDir(dir, args.id);
    await state.reload();
    return jsonResult({ deleted: true, id: args.id, scope: args.scope });
  } catch (error) {
    return errorResult(`delete_driver: ${messageOf(error)}`);
  }
};

export const DRIVER_HANDLERS: Readonly<
  // oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous parsed-args parameter, same controlled use as `server.ts`'s HANDLERS.
  Record<string, (ctx: IDriverToolContext, args: any) => CallToolResult | Promise<CallToolResult>>
> = {
  delete_driver: handleDeleteDriver,
  get_devices: handleGetDevices,
  get_driver: handleGetDriver,
  list_drivers: handleListDrivers,
  set_devices: handleSetDevices,
  set_driver: handleSetDriver,
  use_library_driver: handleUseLibraryDriver,
  validate_driver: handleValidateDriver,
};
