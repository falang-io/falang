import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import type { TSuspendedReason } from '../../projects/projects/project.entity.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';
import { RunnerProcessManager } from './runner-process-manager.js';
import { devTaskQueue, prodTaskQueue } from './task-queue-names.js';

export type { TSuspendedReason } from '../../projects/projects/project.entity.js';

/**
 * Switches a project's servers off for a reason other than the owner's own Stop (ADR 0067 (private) §3): the hosted
 * edition's balance watch (`balance`) and an administrator (`admin`). While `suspended_reason` is set every runner start
 * answers `423`, prod is forced off (`prod_enabled = false`) and both envs' pods and vendor ingress are torn down; a
 * `resume` clears the reason only — prod stays off until the owner starts it again (the offer's 4.11).
 */
@Injectable()
export class ProjectSuspensionService {
  private readonly logger = new Logger(ProjectSuspensionService.name);
  private readonly projects: ProjectsService;
  private readonly runnerProcessManager: RunnerProcessManager;
  private readonly gatewayRuntime: IntegrationsRuntimeService;

  constructor(
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(RunnerProcessManager) runnerProcessManager: RunnerProcessManager,
    @Inject(IntegrationsRuntimeService) gatewayRuntime: IntegrationsRuntimeService,
  ) {
    this.projects = projects;
    this.runnerProcessManager = runnerProcessManager;
    this.gatewayRuntime = gatewayRuntime;
  }

  /**
   * Suspends one project. Idempotent; an `admin` suspension is never downgraded to `balance`, while `admin` replaces
   * `balance`. The reason is written first so no start can slip in while the pods are being stopped.
   */
  async suspend(projectId: string, reason: TSuspendedReason): Promise<void> {
    const current = await this.projects.getSuspendedReason(projectId);
    if (current === 'admin' && reason === 'balance') return;
    if (!(await this.projects.setSuspendedReason(projectId, reason))) {
      throw new NotFoundException(`Project "${projectId}" not found`);
    }
    await this.projects.setProdEnabled(projectId, false);
    await this.runnerProcessManager.stopAll(prodTaskQueue(projectId), 'suspended');
    await this.runnerProcessManager.stop(devTaskQueue(projectId), 'suspended');
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'prod');
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'dev');
  }

  /** Lifts any suspension. Prod stays off. */
  async resume(projectId: string): Promise<void> {
    if (!(await this.projects.setSuspendedReason(projectId, null))) {
      throw new NotFoundException(`Project "${projectId}" not found`);
    }
  }

  /** Suspends every project of `userId`; one failing project doesn't stop the rest (the first error is rethrown at the end). */
  async suspendAllOfOwner(userId: string, reason: TSuspendedReason): Promise<void> {
    const projects = await this.projects.list(userId);
    const results = await Promise.allSettled(projects.map((project) => this.suspend(project.id, reason)));
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    for (const result of failed) {
      this.logger.error('Failed to suspend a project', result.reason instanceof Error ? result.reason.stack : result.reason);
    }
    const [first] = failed;
    if (first) throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
  }

  /** Resumes the owner's projects suspended for exactly `reason` (an `admin` suspension survives a top-up). */
  async resumeAllOfOwner(userId: string, reason: TSuspendedReason): Promise<void> {
    const projects = await this.projects.list(userId);
    await Promise.all(projects.filter((project) => project.suspendedReason === reason).map((project) => this.resume(project.id)));
  }
}
