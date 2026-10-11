import { BadRequestException } from '@nestjs/common';
import type { IRunnerSession } from './runner-session-hooks.js';
import type { IUserRunnerSession } from './runner-sessions.service.js';

/** `IApiRunnerSession` of the ADR 0067 (private) contract — dates as ISO strings. */
export interface IApiRunnerSession {
  id: string;
  projectId: string;
  env: 'dev' | 'prod';
  buildId: string | null;
  deploymentName: string;
  taskQueue: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  endReason: IRunnerSession['endReason'];
}

export interface IApiUserRunnerSession extends IApiRunnerSession {
  projectName: string | null;
}

export const toApiRunnerSession = (session: IRunnerSession): IApiRunnerSession => ({
  id: session.id,
  projectId: session.projectId,
  env: session.env,
  buildId: session.buildId,
  deploymentName: session.deploymentName,
  taskQueue: session.taskQueue,
  startedAt: session.startedAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString(),
  endedAt: session.endedAt ? session.endedAt.toISOString() : null,
  endReason: session.endReason,
});

export const toApiUserRunnerSession = (session: IUserRunnerSession): IApiUserRunnerSession => ({
  id: session.id,
  projectId: session.projectId,
  env: session.env,
  buildId: session.buildId,
  deploymentName: session.deploymentName,
  taskQueue: session.taskQueue,
  startedAt: session.startedAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString(),
  endedAt: session.endedAt ? session.endedAt.toISOString() : null,
  endReason: session.endReason,
  projectName: session.projectName,
});

/** Parses the `limit`/`before` query parameters of the two listing routes (400 on garbage). */
export const parseSessionsQuery = (limit?: string, before?: string): { limit?: number; before?: Date } => {
  const result: { limit?: number; before?: Date } = {};
  if (typeof limit === 'string' && limit !== '') {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed < 1) throw new BadRequestException('limit must be a positive number');
    result.limit = parsed;
  }
  if (typeof before === 'string' && before !== '') {
    const parsed = new Date(before);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('before must be an ISO date');
    result.before = parsed;
  }
  return result;
};
