import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IChatTurn } from '@falang/agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendTurn, createSession, deleteSession, getSession, listSessions, renameSession } from './agent-sessions.js';
import { createProject } from '../project.js';

const sampleTurn = (overrides: Partial<IChatTurn> = {}): IChatTurn => ({
  createdAt: new Date().toISOString(),
  documentId: 'doc-1',
  id: 'turn-1',
  message: 'Done.',
  request: 'Do the thing',
  status: 'done',
  steps: [],
  ...overrides,
});

describe('agent-sessions', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-agent-sessions-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('lists no sessions for a project that never created one', async () => {
    expect(await listSessions(projectDir)).toEqual([]);
  });

  it('creates a session and lists it as a summary', async () => {
    const session = await createSession(projectDir, 'My session');
    expect(session.title).toBe('My session');
    expect(session.turns).toEqual([]);

    const summaries = await listSessions(projectDir);
    expect(summaries).toEqual([
      { createdAt: session.createdAt, id: session.id, title: 'My session', updatedAt: session.updatedAt },
    ]);
  });

  it('defaults a session title when none is given', async () => {
    const session = await createSession(projectDir);
    expect(session.title).toBe('New session');
  });

  it('reads back a full session by id', async () => {
    const created = await createSession(projectDir, 'My session');
    const read = await getSession(projectDir, created.id);
    expect(read).toEqual(created);
  });

  it('returns null for a missing session id', async () => {
    expect(await getSession(projectDir, 'missing')).toBeNull();
  });

  it('renames a session', async () => {
    const created = await createSession(projectDir, 'Old title');
    await renameSession(projectDir, created.id, 'New title');

    const read = await getSession(projectDir, created.id);
    expect(read?.title).toBe('New title');
  });

  it('rejects renaming a session that does not exist', async () => {
    await expect(renameSession(projectDir, 'missing', 'New title')).rejects.toThrow(/not found/);
  });

  it('deletes a session, removing it from both getSession and listSessions', async () => {
    const created = await createSession(projectDir, 'My session');
    await deleteSession(projectDir, created.id);

    expect(await getSession(projectDir, created.id)).toBeNull();
    expect(await listSessions(projectDir)).toEqual([]);
  });

  it('appends turns in order, updating updatedAt to the latest turn', async () => {
    const created = await createSession(projectDir, 'My session');
    const firstTurn = sampleTurn({ id: 'turn-1', request: 'First' });
    const secondTurn = sampleTurn({ id: 'turn-2', request: 'Second' });

    await appendTurn(projectDir, created.id, firstTurn);
    await appendTurn(projectDir, created.id, secondTurn);

    const read = await getSession(projectDir, created.id);
    expect(read?.turns).toEqual([firstTurn, secondTurn]);
    expect(read?.updatedAt).toBe(secondTurn.createdAt);
  });

  it('rejects appending a turn to a session that does not exist', async () => {
    await expect(appendTurn(projectDir, 'missing', sampleTurn())).rejects.toThrow(/not found/);
  });
});
