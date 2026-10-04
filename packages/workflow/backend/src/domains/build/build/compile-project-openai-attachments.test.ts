import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCallAiChoiceNode,
  buildCallAiTextNode,
  buildFunctionNode,
  buildReturnNode,
} from '../../../test-utils/workflow-e2e-fixtures.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// Same cold-start-vs-default-timeout reasoning as `compile-project-documents.test.ts` — a real
// `ts.Program` type-check, run several times in this file.
vi.setConfig({ testTimeout: 20_000 });

/**
 * Regression coverage for a real e2e failure (`integrations-openai.workflow-e2e-spec.ts`'s
 * `call-ai-choice` case started failing `POST /build` with 400 "Project failed to compile") caused
 * by adding `attachments` to `call-ai-choice`'s `promptFields` (ADR 0038 (private) §6). A `call-ai-choice`
 * node with no `attachments` in its `data` (an older document predating the field, or — as here — a
 * fixture/test-util built before the field existed) used to compile the field's resolved value as an
 * empty string, landing as a genuinely empty positional argument between two commas — a syntax error
 * in the generated `workflows.ts`, not a type error. Fixed in `@falang/workflow-compiler`'s
 * `choice-emitters.ts` (a blank `'expression'` field now resolves to the literal `undefined`) plus
 * `callAiChoice`'s own `activitySignature`/`activityCode` in `openai.integration.ts` (accepts
 * `attachments: … | undefined`, defaults it to `[]` before using it).
 */
// Real ts.Program type-check / app boot (up to ~11s alone); the package has no own vitest config, so the default 5s/10s would flake under a full parallel run.
vi.setConfig({ testTimeout: 45_000 });

describe('compileProjectDocuments — openai attachments field (call-ai-choice, call-ai-text)', () => {
  it('type-checks a call-ai-choice node whose data has no attachments key at all (pre-existing document/fixture shape)', () => {
    const document: IProjectDocument = {
      id: 'doc-choice-no-attachments',
      type: 'function',
      name: 'askChoice',
      root: buildFunctionNode(
        'doc-choice-no-attachments',
        [
          buildCallAiChoiceNode(
            'choice1',
            { integration: 'cred-1', model: 'gpt-4o-mini', prompt: 'Pick A or B' },
            [
              { alias: 'OptionA', dataType: { type: 'string' }, children: [buildReturnNode('r-a', '`a:${data}`')] },
              { alias: 'OptionB', dataType: { type: 'string' }, children: [buildReturnNode('r-b', '`b:${data}`')] },
            ],
          ),
        ],
        { type: 'string' },
      ),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await callAiChoice("cred-1", "gpt-4o-mini", `Pick A or B`, undefined,');
  });

  it('type-checks a call-ai-choice node whose attachments field is populated', () => {
    const choiceNode: INode = {
      id: 'choice2',
      name: 'call-ai-choice',
      data: { integration: 'cred-1', model: 'gpt-4o-mini', prompt: 'Pick A or B', attachments: '[]' },
      children: [
        {
          id: 'choice2-option-0',
          name: 'call-ai-choice-option',
          data: { alias: 'OptionA', dataType: { type: 'string' }, variable: 'data' },
          children: [buildReturnNode('r-a2', '`a:${data}`')],
        },
      ],
    };
    const document: IProjectDocument = {
      id: 'doc-choice-with-attachments',
      type: 'function',
      name: 'askChoiceWithAttachments',
      root: buildFunctionNode('doc-choice-with-attachments', [choiceNode], { type: 'string' }),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await callAiChoice("cred-1", "gpt-4o-mini", `Pick A or B`, [],');
  });

  it('type-checks a call-ai-text node with no attachments (its own action emit already defaults to [])', () => {
    const document: IProjectDocument = {
      id: 'doc-text-no-attachments',
      type: 'function',
      name: 'askText',
      root: buildFunctionNode(
        'doc-text-no-attachments',
        [
          buildCallAiTextNode('text1', {
            integration: 'cred-1',
            model: 'gpt-4o-mini',
            prompt: 'Say hi',
            resultVariable: 'reply',
          }),
          buildReturnNode('text1-return', 'reply'),
        ],
        { type: 'string' },
      ),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await callAiText("cred-1", "gpt-4o-mini", `Say hi`, [])');
  });

  it('type-checks a call-ai-text node with an explicit attachments expression', () => {
    const document: IProjectDocument = {
      id: 'doc-text-with-attachments',
      type: 'function',
      name: 'askTextWithAttachments',
      root: buildFunctionNode(
        'doc-text-with-attachments',
        [
          buildCallAiTextNode('text2', {
            integration: 'cred-1',
            model: 'gpt-4o-mini',
            prompt: 'Describe this',
            resultVariable: 'reply',
            attachments: '[]',
          }),
          buildReturnNode('text2-return', 'reply'),
        ],
        { type: 'string' },
      ),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await callAiText("cred-1", "gpt-4o-mini", `Describe this`, [])');
  });
});
