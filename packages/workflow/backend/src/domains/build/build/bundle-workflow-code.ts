import { bundleWorkflowCode as temporalBundleWorkflowCode } from '@temporalio/worker';

/**
 * What Temporal's bundler rewrites webpack's module-cache declaration into. With `reuseV8Context`
 * (the Worker default) every Workflow execution shares one V8 context, and this global is a proxy
 * onto the *current* execution's own module cache — that is what gives each execution a fresh copy
 * of every module's top-level state (the compiled position/debug runtimes' stacks, a `let` a user
 * declares at module level, …).
 */
const ISOLATED_MODULE_CACHE = 'var __webpack_module_cache__ = globalThis.__webpack_module_cache__';

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
 */
export const bundleWorkflowCode = async (workflowsPath: string): Promise<string> => {
  const { code } = await temporalBundleWorkflowCode({
    workflowsPath,
    webpackConfigHook: (config) => ({
      ...config,
      output: { ...config.output, environment: { ...config.output?.environment, const: false } },
    }),
  });
  assertIsolatedModuleCache(code);
  return code;
};

/** Throws unless Temporal's per-execution module-cache rewrite landed in `code`. */
export const assertIsolatedModuleCache = (code: string): void => {
  if (!code.includes(ISOLATED_MODULE_CACHE)) {
    throw new Error(
      'Workflow bundle does not use the per-execution module cache — executions would share module state. ' +
        'Check the webpack output (`output.environment.const`) against @temporalio/worker\'s bundler.',
    );
  }
};
