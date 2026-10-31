import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBackendCommand } from './resolve-backend-command.js';

const base = {
  resourcesPath: '/res',
  execPath: '/bin/falang-flow',
  repoRoot: '/repo',
  dataDir: '/data',
  statusFile: '/data/status.json',
  port: 0,
};

describe('resolveBackendCommand', () => {
  it('dev: the workspace sources through tsx, cwd = the repository', () => {
    const result = resolveBackendCommand({ ...base, isPackaged: false });
    expect(result.cwd).toBe('/repo');
    expect(result.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(result.args.slice(0, 3)).toEqual([
      '--import',
      'tsx',
      path.join('/repo', 'packages', 'workflow', 'local', 'src', 'main.ts'),
    ]);
    expect(result.args).not.toContain('--client-dir');
    expect(result.args).toContain('--status-file');
  });

  it('packaged: the bundled copy under resources and the bundled client', () => {
    const result = resolveBackendCommand({ ...base, isPackaged: true });
    expect(result.cwd).toBe(path.join('/res', 'backend-dist'));
    expect(result.args[2]).toBe(
      path.join('/res', 'backend-dist', 'node_modules', '@falang', 'workflow-local', 'src', 'main.ts'),
    );
    expect(result.args.slice(-2)).toEqual(['--client-dir', path.join('/res', 'client')]);
  });

  it('packaged: runs from the staged writable copy, the client stays in resources', () => {
    const result = resolveBackendCommand({ ...base, isPackaged: true, stagedBackendDist: '/user/flow/backend-dist' });
    expect(result.cwd).toBe('/user/flow/backend-dist');
    expect(result.args[2]).toBe(
      path.join('/user/flow/backend-dist', 'node_modules', '@falang', 'workflow-local', 'src', 'main.ts'),
    );
    expect(result.args.slice(-2)).toEqual(['--client-dir', path.join('/res', 'client')]);
  });
});
