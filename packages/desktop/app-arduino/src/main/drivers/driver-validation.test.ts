/* oxlint-disable no-await-expression-member, no-undefined, no-useless-undefined, init-declarations -- test files: terse awaits on service results and a `let` assigned in beforeEach */
import { describe, expect, it, vi } from 'vitest';
import { createFullValidator, mergeCliResult } from './driver-validation.js';

const OK = { ok: true, errors: [], warnings: [] } as const;

const baseDeps = (overrides: Partial<Parameters<typeof createFullValidator>[0]> = {}) => ({
  runWorker: vi.fn(() => Promise.resolve([{ result: OK, sketchFiles: { 'sketch.ino': '' } }])),
  otherDriversFor: () => [],
  readProjectContext: () => Promise.resolve({ documents: [] }),
  getProjectDir: () => '/p' as string | null,
  getFqbn: vi.fn(() => Promise.resolve('arduino:avr:uno')),
  cliCheckFor: vi.fn(() => () => Promise.resolve({})),
  ...overrides,
});

describe('mergeCliResult', () => {
  it('turns cli errors into a failing result and cli warnings into warnings', () => {
    expect(mergeCliResult(OK, { errors: ['boom'] })).toMatchObject({
      ok: false,
      errors: [{ stage: 'cli', message: 'boom' }],
    });
    expect(mergeCliResult(OK, { warnings: ['no core'] })).toMatchObject({ ok: true, warnings: [{ stage: 'cli' }] });
  });
});

describe('createFullValidator', () => {
  it('runs the cli stage on the captured sketch with the project board and merges the outcome', async () => {
    const check = vi.fn(() => Promise.resolve({ errors: ['bad cpp'] }));
    const deps = baseDeps({
      cliCheckFor: vi.fn(() => check),
      getFqbn: vi.fn(() => Promise.resolve('esp32:esp32:esp32')),
    });
    const result = await createFullValidator(deps)({}, 'project');
    expect(result.ok).toBe(false);
    expect(deps.cliCheckFor).toHaveBeenCalledWith('esp32:esp32:esp32');
    expect(check).toHaveBeenCalledWith({ 'sketch.ino': '' });
  });

  it('skips the cli stage when the worker stages already failed', async () => {
    const failed = { ok: false, errors: [{ stage: 'templates' as const, message: 'x' }], warnings: [] };
    const deps = baseDeps({ runWorker: vi.fn(() => Promise.resolve([{ result: failed }])) });
    expect((await createFullValidator(deps)({}, 'library')).ok).toBe(false);
    expect(deps.cliCheckFor).not.toHaveBeenCalled();
  });

  it('only passes the project context for project scope and refuses project scope without a project', async () => {
    const runWorker = vi.fn((_items: readonly { ctx: object }[]) =>
      Promise.resolve([{ result: OK, sketchFiles: { 'sketch.ino': '' } }]),
    );
    const deps = baseDeps({ runWorker });
    await createFullValidator(deps)({}, 'library');
    expect(runWorker.mock.calls[0][0][0].ctx).not.toHaveProperty('project');
    await createFullValidator(deps)({}, 'project');
    expect(runWorker.mock.calls[1][0][0].ctx).toHaveProperty('project');
    const none = baseDeps({ getProjectDir: () => null });
    expect((await createFullValidator(none)({}, 'project')).ok).toBe(false);
  });
});
