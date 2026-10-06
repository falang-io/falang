import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

/**
 * `buildWorkflowPreamble` only imports `workflowInfo` from `@temporalio/workflow` when the project
 * has at least one `delivery: 'start'` trigger-function (see ADR 0037 (private) §3/§4 and
 * `compile-trigger-function.ts`'s own doc comment) — split out from `compile-project.test.ts` to
 * keep that file under the repo's `max-lines` lint budget.
 */

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'telegram-trigger',
      label: 'On message',
      notes: 'Fires for every incoming message.',
      scopeType: { type: 'any' },
      scopeVariableName: 'message',
      signalName: 'telegramMessage',
      webhookPath: '/webhooks/telegram/:credentialId/:env',
    },
  ],
  actions: [],
};

const scheduleIntegration: IWorkflowIntegration = {
  vendor: 'schedule',
  label: 'Schedule',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'schedule-interval',
      label: 'Every N minutes',
      notes: 'Fires on a fixed interval.',
      // Real vendor payload is `schedule/Fire` — see compile-trigger-function.test.ts's own note;
      // `any` keeps this fixture focused on the import-set behavior under test.
      scopeType: { type: 'any' },
      scopeVariableName: 'fire',
      signalName: 'scheduleFire',
      webhookPath: '/webhooks/schedule/:credentialId/:env',
      delivery: 'start',
    },
  ],
  actions: [],
};

const triggerFunctionNode = (id: string, vendor: 'telegram' | 'schedule'): INode => ({
  id,
  name: 'trigger-function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    {
      id: `${id}-body`,
      name: 'trigger-function-body',
      data:
        vendor === 'telegram'
          ? { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' }
          : { vendor: 'schedule', triggerName: 'schedule-interval', credentialId: 'schedule' },
      children: [],
    },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name,
  root,
});

const importLine = (workflows: string): string => workflows.split('\n')[0] ?? '';

describe('compileProject — workflowInfo import (delivery: "start")', () => {
  it('does not import workflowInfo when no trigger-function uses delivery: "start"', () => {
    const result = compileProject({
      documents: [triggerFunctionDocument('doc-trigger', 'onMessage', triggerFunctionNode('doc-trigger', 'telegram'))],
      integrations: [telegramIntegration],
    });

    expect(importLine(result.workflows)).toBe(
      "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
    );
  });

  it('imports workflowInfo when a trigger-function uses delivery: "start"', () => {
    const result = compileProject({
      documents: [triggerFunctionDocument('doc-schedule', 'onFire', triggerFunctionNode('doc-schedule', 'schedule'))],
      integrations: [scheduleIntegration],
    });

    expect(importLine(result.workflows)).toBe(
      "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler, workflowInfo } from '@temporalio/workflow';",
    );
  });

  it('still imports workflowInfo when a "start" trigger-function sits alongside a plain "signal" one', () => {
    const result = compileProject({
      documents: [
        triggerFunctionDocument('doc-trigger', 'onMessage', triggerFunctionNode('doc-trigger', 'telegram')),
        triggerFunctionDocument('doc-schedule', 'onFire', triggerFunctionNode('doc-schedule', 'schedule')),
      ],
      integrations: [telegramIntegration, scheduleIntegration],
    });

    expect(importLine(result.workflows)).toBe(
      "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler, workflowInfo } from '@temporalio/workflow';",
    );
  });
});
