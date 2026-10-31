// oxlint-disable no-non-null-assertion, no-empty-function -- test fixtures index into arrays they just filled.
import { EventEmitter } from 'node:events';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { V1Deployment } from '@falang/workflow-backend';
import { describe, expect, it } from 'vitest';
import { createProcessDeploymentsClient, matchesLabelSelector } from './process-deployments-client.js';

// oxlint-disable-next-line unicorn/prefer-event-target -- mimics a ChildProcess emitter.
class FakeChild extends EventEmitter {
  pid = 1;
  killed: string[] = [];
  private readonly exitOn: 'SIGTERM' | 'SIGKILL' | 'never';
  constructor(exitOn: 'SIGTERM' | 'SIGKILL' | 'never') {
    super();
    this.exitOn = exitOn;
  }
  kill(signal: string) {
    this.killed.push(signal);
    if (this.exitOn === signal) queueMicrotask(() => this.emit('exit', null, signal));
    return true;
  }
}

const deployment = (name: string, env: Record<string, string>, labels: Record<string, string> = {}): V1Deployment => ({
  metadata: { name, labels: { 'app.kubernetes.io/name': 'workflow-runner', 'falang.dev/task-queue': 'q1', ...labels } },
  spec: {
    template: {
      spec: { containers: [{ name: 'runner', env: Object.entries(env).map(([n, value]) => ({ name: n, value })) }] },
    },
  } as never,
});

const setup = (exitOn: 'SIGTERM' | 'SIGKILL' | 'never' = 'SIGTERM', killTimeoutMs = 20) => {
  const spawned: { file: string; args: readonly string[]; options: SpawnOptions; child: FakeChild }[] = [];
  const client = createProcessDeploymentsClient({
    command: { file: 'node', args: ['runner.js'] },
    baseEnv: { HOME: '/home/me', A: 'base', B: 'base' },
    log: () => {},
    killTimeoutMs,
    spawn: (file, args, options) => {
      const child = new FakeChild(exitOn);
      spawned.push({ file, args, options, child });
      return child as unknown as ChildProcess;
    },
  });
  return { client, spawned };
};

describe('matchesLabelSelector', () => {
  const labels = { a: '1', b: '2' };
  it('handles equality, inequality, existence and conjunction', () => {
    expect(matchesLabelSelector(labels, 'a=1')).toBe(true);
    expect(matchesLabelSelector(labels, 'a=1,b=2')).toBe(true);
    expect(matchesLabelSelector(labels, 'a=1,b=3')).toBe(false);
    expect(matchesLabelSelector(labels, 'a!=2')).toBe(true);
    expect(matchesLabelSelector(labels, 'c')).toBe(false);
    expect(matchesLabelSelector(labels, 'a==1')).toBe(true);
  });
  it('matches the manager selectors with slashes in keys', () => {
    expect(matchesLabelSelector({ 'falang.dev/task-queue': 'q' }, 'falang.dev/task-queue=q')).toBe(true);
  });
});

describe('createProcessDeploymentsClient', () => {
  it('merges env: deployment over base, HOME dropped', async () => {
    const { client, spawned } = setup();
    await client.apply('ns', deployment('d1', { HOME: '/tmp', B: 'pod', C: 'pod' }));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.file).toBe('node');
    expect(spawned[0]!.args).toEqual(['runner.js']);
    expect(spawned[0]!.options.env).toEqual({ HOME: '/home/me', A: 'base', B: 'pod', C: 'pod' });
  });

  it('lists by selector and reports labels and createdAt', async () => {
    const { client } = setup();
    await client.apply('ns', deployment('d1', {}, { 'falang.dev/env': 'dev' }));
    await client.apply('ns', deployment('d2', {}, { 'falang.dev/task-queue': 'q2' }));
    expect(await client.listNames('ns', 'falang.dev/task-queue=q1')).toEqual(['d1']);
    expect(await client.listNames('ns', 'app.kubernetes.io/name=workflow-runner')).toEqual(['d1', 'd2']);
    const [one] = await client.listAll('ns', 'falang.dev/task-queue=q1');
    expect(one!.labels['falang.dev/env']).toBe('dev');
    expect(one!.createdAt).toBeInstanceOf(Date);
    expect(await client.exists('ns', 'd1')).toBe(true);
    expect(await client.exists('ns', 'zz')).toBe(false);
  });

  it('replaces a live process on apply', async () => {
    const { client, spawned } = setup();
    await client.apply('ns', deployment('d1', { X: '1' }));
    await client.apply('ns', deployment('d1', { X: '2' }));
    expect(spawned).toHaveLength(2);
    expect(spawned[0]!.child.killed).toEqual(['SIGTERM']);
    expect(await client.listNames('ns', 'falang.dev/task-queue=q1')).toEqual(['d1']);
  });

  it('delete sends SIGTERM and does not escalate when the process exits', async () => {
    const { client, spawned } = setup('SIGTERM');
    await client.apply('ns', deployment('d1', {}));
    await client.delete('ns', 'd1');
    expect(spawned[0]!.child.killed).toEqual(['SIGTERM']);
    expect(await client.exists('ns', 'd1')).toBe(false);
    await expect(client.delete('ns', 'd1')).resolves.toBeUndefined();
  });

  it('escalates to SIGKILL after the timeout', async () => {
    const { client, spawned } = setup('SIGKILL', 10);
    await client.apply('ns', deployment('d1', {}));
    await client.delete('ns', 'd1');
    expect(spawned[0]!.child.killed).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('removes the record when the process exits on its own', async () => {
    const { client, spawned } = setup();
    await client.apply('ns', deployment('d1', {}));
    spawned[0]!.child.emit('exit', 1, null);
    expect(await client.exists('ns', 'd1')).toBe(false);
  });

  it('stopAll terminates everything', async () => {
    const { client, spawned } = setup();
    await client.apply('ns', deployment('d1', {}));
    await client.apply('ns', deployment('d2', {}));
    await client.stopAll();
    expect(spawned.map((s) => s.child.killed)).toEqual([['SIGTERM'], ['SIGTERM']]);
    expect(await client.listNames('ns', 'app.kubernetes.io/name=workflow-runner')).toEqual([]);
  });
});
