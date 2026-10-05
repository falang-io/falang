import { dirname, sep } from 'node:path';
import { bundleWorkflowCode as temporalBundleWorkflowCode, type BundleOptions, type Logger } from '@temporalio/worker';

type TWebpackConfig = Parameters<NonNullable<BundleOptions['webpackConfigHook']>>[0];

const NODE_MODULES_SEGMENT = /[\\/]node_modules[\\/]/;
const MAX_WEBPACK_ERROR_CHARS = 4000;

/**
 * What Temporal's bundler rewrites webpack's module-cache declaration into. With `reuseV8Context`
 * (the Worker default) every Workflow execution shares one V8 context, and this global is a proxy
 * onto the *current* execution's own module cache — that is what gives each execution a fresh copy
 * of every module's top-level state (the compiled position/debug runtimes' stacks, a `let` a user
 * declares at module level, …).
 */
const ISOLATED_MODULE_CACHE = 'var __webpack_module_cache__ = globalThis.__webpack_module_cache__';

/** Throws unless Temporal's per-execution module-cache rewrite landed in `code`. */
export const assertIsolatedModuleCache = (code: string): void => {
  if (!code.includes(ISOLATED_MODULE_CACHE)) {
    throw new Error(
      'Workflow bundle does not use the per-execution module cache — executions would share module state. ' +
        'Check the webpack output (`output.environment.const`) against @temporalio/worker\'s bundler.',
    );
  }
};

/**
 * Temporal's bundler compiles `.ts` with swc only outside `node_modules` (`exclude: /node_modules/`).
 * In an image that installs the backend as a dependency (the cloud edition's
 * `/app/node_modules/@falang/workflow-backend`), the build directory itself sits under
 * `node_modules`, so `workflows.ts` was parsed as plain JavaScript and every build failed with
 * "Module parse failed: Unexpected token" (found on prod, 2026-10-05). Narrow the exclusion so the
 * build directory is always compiled; everything else under `node_modules` stays excluded.
 */
export const includeBuildDirInTsRule = (config: TWebpackConfig, buildDir: string): TWebpackConfig => {
  const prefix = buildDir.endsWith(sep) ? buildDir : buildDir + sep;
  const rules = config.module?.rules?.map((rule) => {
    if (!rule || typeof rule !== 'object' || !(rule.exclude instanceof RegExp)) return rule;
    if (!(rule.test instanceof RegExp) || !rule.test.test('workflows.ts')) return rule;
    return { ...rule, exclude: (path: string) => NODE_MODULES_SEGMENT.test(path) && !path.startsWith(prefix) };
  });
  return rules ? { ...config, module: { ...config.module, rules } } : config;
};

const ignoreLogEntry = (): null => null;

/** Keeps webpack's ERROR-level output, which Temporal's own error message ("Webpack finished with errors") leaves out. */
const createCollectingLogger = (): { readonly logger: Logger; readonly errors: string[] } => {
  const errors: string[] = [];
  const logger: Logger = {
    log: (level, message) => {
      if (level === 'ERROR') errors.push(message);
    },
    trace: ignoreLogEntry,
    debug: ignoreLogEntry,
    info: ignoreLogEntry,
    warn: ignoreLogEntry,
    error: (message) => {
      errors.push(message);
    },
  };
  return { logger, errors };
};

const runTemporalBundler = async (workflowsPath: string): Promise<string> => {
  const { logger, errors } = createCollectingLogger();
  try {
    const { code } = await temporalBundleWorkflowCode({
      workflowsPath,
      logger,
      webpackConfigHook: (config) => {
        const withTs = includeBuildDirInTsRule(config, dirname(workflowsPath));
        return {
          ...withTs,
          output: { ...withTs.output, environment: { ...withTs.output?.environment, const: false } },
        };
      },
    });
    return code;
  } catch (error) {
    const details = errors.join('\n').slice(-MAX_WEBPACK_ERROR_CHARS);
    if (error instanceof Error && details) error.message = `${error.message}\n${details}`;
    throw error;
  }
};

/**
 * Pre-bundles a compiled workflows module into a single webpack bundle string, so a runner pod can
 * hand it straight to `Worker.create({ workflowBundle: { code } })` at pod start without ever
 * invoking Temporal's own bundler itself — see ADR 0016 (private)'s
 * "Artifact delivery into the runner pod". `workflowsPath` must already be written to disk inside a
 * node_modules-resolvable tree (same constraint `Worker.create({ workflowsPath })` has today, see
 * ADR 0002 (private)), since Temporal's bundler resolves
 * `@temporalio/workflow` via real Node module resolution starting from that path.
 *
 * `output.environment.const: false`: Temporal's bundler isolates executions by a plain string
 * replace of `var __webpack_module_cache__ = {}` (see `ISOLATED_MODULE_CACHE`). Newer webpack
 * releases (5.108 here) emit `const __webpack_module_cache__ = {}` by default, the replace silently
 * misses, and every execution on a Worker shares one instance of the workflows module — found live:
 * a run's position stack showed a frame pushed by a *different* trigger's execution. The bundle is
 * checked afterwards so a future webpack/SDK change fails the build instead of shipping that.
 *
 * On failure the thrown error carries webpack's own error output (the module and line that failed),
 * since the build runs in a child process whose logs are otherwise lost.
 */
export const bundleWorkflowCode = async (workflowsPath: string): Promise<string> => {
  const code = await runTemporalBundler(workflowsPath);
  assertIsolatedModuleCache(code);
  return code;
};
