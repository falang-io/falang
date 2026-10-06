import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { INode, IProjectDocument } from '@falang/dto';
import { TELEGRAM_QUESTION_NAME, TELEGRAM_TRIGGER_NAME, TELEGRAM_VENDOR } from '@falang/workflow-integrations-telegram';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { buildCallAiTextNode, buildLogNode } from '../../../test-utils/workflow-e2e-fixtures.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { runBuildJob } from './build-job.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// Real ts.Program type-check + a real webpack bundle.
vi.setConfig({ testTimeout: 90_000 });

const question = (id: string, timeout: string): INode => ({
  id,
  name: TELEGRAM_QUESTION_NAME,
  data: { credentialId: 'cred-1', chatId: 'message.chat.id', question: 'Pick', timeout, options: ['Yes', 'No'] },
  children: [
    { id: `${id}-yes`, name: `${TELEGRAM_QUESTION_NAME}-option`, data: { label: 'Yes' }, children: [] },
    { id: `${id}-no`, name: `${TELEGRAM_QUESTION_NAME}-option`, data: { label: 'No' }, children: [] },
    ...(timeout
      ? [{ id: `${id}-t`, name: `${TELEGRAM_QUESTION_NAME}-option`, data: { label: 'timeout', fixed: true }, children: [] }]
      : []),
  ],
});

const document: IProjectDocument = {
  id: 'doc-1',
  type: 'trigger-function',
  name: 'onMessage',
  root: {
    id: 'doc-1',
    name: 'trigger-function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      {
        id: 'b',
        name: 'trigger-function-body',
        data: { vendor: TELEGRAM_VENDOR, triggerName: TELEGRAM_TRIGGER_NAME, credentialId: 'cred-1' },
        children: [
          buildLogNode('log1', 'got ${message.text}'),
          buildCallAiTextNode('ai1', { integration: 'cred-2', model: 'gpt', prompt: 'Say hi', resultVariable: 'answer' }),
          buildLogNode('log2', '${answer}'),
          question('q1', ''),
          question('q2', '5m'),
        ],
      },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
};

describe('run journal (ADR 0059): generated code', () => {
  it('type-checks log + trigger entry + telegram-question (with and without timeout) + call-ai-text unwrapping .text', () => {
    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain("__falangJournal({ kind: 'trigger'");
    expect(result.workflows).toContain("kind: 'user-input', level: 'warn'");
    expect(result.workflows).toContain('const answer = (await callAiText(');
    expect(result.workflows).not.toContain('await logActivity(');
    expect(result.activities).toContain('export const __falangActivityJournal');
    expect(result.activities).toContain('callAiText:');
    expect(result.activities).toContain('telegramAskQuestion:');
  });

  it('bundles the workflows module together with the generated node-id interceptor', async () => {
    const compiled = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    // oxlint-disable-next-line unicorn/prefer-module -- CommonJS package.
    const buildsDir = join(__dirname, '..', '..', '..', '..', '.builds');
    mkdirSync(buildsDir, { recursive: true });
    const workDir = mkdtempSync(join(buildsDir, 'build-journal-test-'));
    try {
      const result = await runBuildJob({
        workflows: compiled.workflows,
        activities: compiled.activities,
        workDir,
        bundle: true,
      });
      expect(result.kind).toBe('built');
      if (result.kind !== 'built') return;
      expect(result.workflowBundle).toContain('falang-node');
      expect(result.workflowBundle).toContain('scheduleLocalActivity');
      // swc (the bundler) does not type-check — do it for the interceptor module against the real workflows module.
      const files = [join(workDir, 'workflows.ts'), join(workDir, 'journal-interceptors.ts')];
      const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['node'],
      });
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .filter((d) => d.file && files.includes(d.file.fileName))
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(diagnostics.filter((message) => !message.includes('relative import paths need explicit file extensions'))).toEqual([]);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
