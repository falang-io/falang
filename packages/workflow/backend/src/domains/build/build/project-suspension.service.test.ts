import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { AdminProjectSuspensionController } from './admin-project-suspension.controller.js';
import { ProjectSuspensionService } from './project-suspension.service.js';

const makeService = (initial: Record<string, 'balance' | 'admin' | null> = {}, owned: Record<string, string[]> = {}) => {
  const reasons = new Map<string, 'balance' | 'admin' | null>(Object.entries(initial));
  const projects = {
    getSuspendedReason: vi.fn((id: string) => Promise.resolve(reasons.get(id) ?? null)),
    setSuspendedReason: vi.fn((id: string, reason: 'balance' | 'admin' | null) => {
      if (!reasons.has(id)) return Promise.resolve(false);
      reasons.set(id, reason);
      return Promise.resolve(true);
    }),
    setProdEnabled: vi.fn(() => Promise.resolve(true)),
    list: vi.fn((ownerId: string) =>
      Promise.resolve((owned[ownerId] ?? []).map((id) => ({ id, suspendedReason: reasons.get(id) ?? null }))),
    ),
  };
  const runnerProcessManager = { stopAll: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()) };
  const gatewayRuntime = { stopProjectIntegrations: vi.fn() };
  const service = new ProjectSuspensionService(
    projects as never,
    runnerProcessManager as never,
    gatewayRuntime as never,
  );
  return { service, reasons, projects, runnerProcessManager, gatewayRuntime };
};

describe('ProjectSuspensionService (ADR 0067)', () => {
  it('suspend: sets the reason, forces prod off, stops both envs with reason "suspended" and parks the ingress', async () => {
    const { service, reasons, projects, runnerProcessManager, gatewayRuntime } = makeService({ p1: null });
    await service.suspend('p1', 'balance');
    expect(reasons.get('p1')).toBe('balance');
    expect(projects.setProdEnabled).toHaveBeenCalledWith('p1', false);
    expect(runnerProcessManager.stopAll).toHaveBeenCalledWith('workflow-p1', 'suspended');
    expect(runnerProcessManager.stop).toHaveBeenCalledWith('workflow-dev-p1', 'suspended');
    expect(gatewayRuntime.stopProjectIntegrations).toHaveBeenCalledWith('p1', 'prod');
    expect(gatewayRuntime.stopProjectIntegrations).toHaveBeenCalledWith('p1', 'dev');
  });

  it('writes the reason before touching any pod', async () => {
    const { service, projects, runnerProcessManager } = makeService({ p1: null });
    const order: string[] = [];
    projects.setSuspendedReason.mockImplementation(() => {
      order.push('reason');
      return Promise.resolve(true);
    });
    runnerProcessManager.stopAll.mockImplementation(() => {
      order.push('stop');
      return Promise.resolve();
    });
    await service.suspend('p1', 'admin');
    expect(order).toEqual(['reason', 'stop']);
  });

  it('an admin suspension replaces a balance one, but balance never overrides admin', async () => {
    const { service, reasons, runnerProcessManager } = makeService({ p1: 'balance', p2: 'admin' });
    await service.suspend('p1', 'admin');
    expect(reasons.get('p1')).toBe('admin');
    runnerProcessManager.stopAll.mockClear();
    await service.suspend('p2', 'balance');
    expect(reasons.get('p2')).toBe('admin');
    expect(runnerProcessManager.stopAll).not.toHaveBeenCalled();
  });

  it('resume clears the reason and does not turn prod back on', async () => {
    const { service, reasons, projects } = makeService({ p1: 'admin' });
    await service.resume('p1');
    expect(reasons.get('p1')).toBeNull();
    expect(projects.setProdEnabled).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown project', async () => {
    const { service } = makeService();
    await expect(service.suspend('nope', 'admin')).rejects.toThrow('not found');
    await expect(service.resume('nope')).rejects.toThrow('not found');
  });

  it('suspendAllOfOwner / resumeAllOfOwner cover the owner’s projects; resume lifts only the given reason', async () => {
    const { service, reasons } = makeService({ a: null, b: null, c: null, other: null }, { u1: ['a', 'b', 'c'] });
    await service.suspendAllOfOwner('u1', 'balance');
    expect([reasons.get('a'), reasons.get('b'), reasons.get('c'), reasons.get('other')]).toEqual(['balance', 'balance', 'balance', null]);

    reasons.set('b', 'admin');
    await service.resumeAllOfOwner('u1', 'balance');
    expect([reasons.get('a'), reasons.get('b'), reasons.get('c')]).toEqual([null, 'admin', null]);
  });

  it('suspendAllOfOwner carries on past a failing project and rethrows afterwards', async () => {
    const { service, reasons, runnerProcessManager } = makeService({ a: null, b: null }, { u1: ['a', 'b'] });
    runnerProcessManager.stopAll.mockRejectedValueOnce(new Error('k8s down'));
    await expect(service.suspendAllOfOwner('u1', 'balance')).rejects.toThrow('k8s down');
    expect(reasons.get('b')).toBe('balance');
  });
});

describe('AdminProjectSuspensionController', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  const suspension = { suspend: vi.fn(() => Promise.resolve()), resume: vi.fn(() => Promise.resolve()) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminProjectSuspensionController],
      providers: [{ provide: ProjectSuspensionService, useValue: suspension }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('POST suspend → 204 with the admin reason; POST resume → 204', async () => {
    await request(app.getHttpServer()).post('/admin/projects/p1/suspend').expect(204);
    expect(suspension.suspend).toHaveBeenCalledWith('p1', 'admin');
    await request(app.getHttpServer()).post('/admin/projects/p1/resume').expect(204);
    expect(suspension.resume).toHaveBeenCalledWith('p1');
  });

  it('is behind AdminGuard', () => {
    const guards = Reflect.getMetadata('__guards__', AdminProjectSuspensionController) as unknown[];
    expect(guards).toContain(AdminGuard);
  });
});
