import { describe, expect, it } from 'vitest';
import { buildActionScopeContributor, registerIntegrationScopeContributors } from './action-scope-contributor.js';
import type { IActionDescriptor, IWorkflowIntegration } from './types.js';

const noopEmit = () => '';
const neverCalledRegister = (): never => {
  throw new Error('should not be called');
};

const baseAction: IActionDescriptor = {
  name: 'test-action',
  label: 'Test action',
  fields: [],
  emit: noopEmit,
  activityCode: '',
  activitySignature: 'testAction(): Promise<void>',
};

describe('buildActionScopeContributor', () => {
  it('returns undefined for an action with no new-variable field', () => {
    expect(buildActionScopeContributor(baseAction)).toBeUndefined();
  });

  it('contributes nothing when the new-variable field is still empty (never edited)', () => {
    const action: IActionDescriptor = {
      ...baseAction,
      fields: [{ name: 'resultVariable', label: 'Result', kind: 'new-variable' }],
    };
    const contributor = buildActionScopeContributor(action);
    expect(contributor?.({ resultVariable: '' })).toBeUndefined();
  });

  it('falls back to `any` when the action declares no resultType', () => {
    const action: IActionDescriptor = {
      ...baseAction,
      fields: [{ name: 'resultVariable', label: 'Result', kind: 'new-variable' }],
    };
    const contributor = buildActionScopeContributor(action);
    expect(contributor?.({ resultVariable: 'out' })).toEqual({ name: 'out', type: { type: 'any' } });
  });

  it('uses a static resultType as-is', () => {
    const action: IActionDescriptor = {
      ...baseAction,
      fields: [{ name: 'resultVariable', label: 'Result', kind: 'new-variable' }],
      resultType: { type: 'string', constant: true },
    };
    const contributor = buildActionScopeContributor(action);
    expect(contributor?.({ resultVariable: 'out' })).toEqual({
      name: 'out',
      type: { type: 'string', constant: true },
    });
  });

  it("resolves a function resultType against the node's own field-value snapshot", () => {
    const action: IActionDescriptor = {
      ...baseAction,
      fields: [
        { name: 'method', label: 'Method', kind: 'select' },
        { name: 'resultVariable', label: 'Result', kind: 'new-variable' },
      ],
      resultType: (fields) => {
        if (fields.method === 'listUsers') return { type: 'struct', id: 'vendor/User' };
      },
    };
    const contributor = buildActionScopeContributor(action);
    expect(contributor?.({ method: 'listUsers', resultVariable: 'users' })).toEqual({
      name: 'users',
      type: { type: 'struct', id: 'vendor/User' },
    });
  });

  it('falls back to `any` when a function resultType returns undefined for the current field values', () => {
    const action: IActionDescriptor = {
      ...baseAction,
      fields: [
        { name: 'method', label: 'Method', kind: 'select' },
        { name: 'resultVariable', label: 'Result', kind: 'new-variable' },
      ],
      resultType: (fields) => {
        if (fields.method === 'listUsers') return { type: 'struct', id: 'vendor/User' };
      },
    };
    const contributor = buildActionScopeContributor(action);
    expect(contributor?.({ method: '', resultVariable: 'out' })).toEqual({ name: 'out', type: { type: 'any' } });
  });

  it("matches call-ai-text's own regression: resultVariable is still typed string in scope", () => {
    const callAiTextLikeAction: IActionDescriptor = {
      ...baseAction,
      name: 'call-ai-text',
      fields: [
        { name: 'result', label: 'Result', kind: 'result-type' },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      resultType: (fields) => {
        try {
          const parsed = JSON.parse(fields.result || '{}') as { type?: string; id?: string };
          if (parsed.type === 'struct' && parsed.id) return { type: 'struct', id: parsed.id, constant: true };
        } catch {
          // fall through to the string default below
        }
        return { type: 'string', constant: true };
      },
    };
    const contributor = buildActionScopeContributor(callAiTextLikeAction);
    expect(contributor?.({ result: '{"type":"string"}', resultVariable: 'answer' })).toEqual({
      name: 'answer',
      type: { type: 'string', constant: true },
    });
  });
});

describe('registerIntegrationScopeContributors', () => {
  it('registers one contributor per action with a new-variable field, keyed by action name, skipping actions without one', () => {
    const integration: IWorkflowIntegration = {
      vendor: 'acme',
      label: 'Acme',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [
        { ...baseAction, name: 'acme-no-result' },
        {
          ...baseAction,
          name: 'acme-with-result',
          fields: [{ name: 'resultVariable', label: 'Result', kind: 'new-variable' }],
          resultType: { type: 'boolean' },
        },
      ],
    };

    const registered = new Map<string, ReturnType<typeof buildActionScopeContributor>>();
    registerIntegrationScopeContributors([integration], (nodeName, contributor) => {
      registered.set(nodeName, contributor);
    });

    expect([...registered.keys()]).toEqual(['acme-with-result']);
    expect(registered.get('acme-with-result')?.({ resultVariable: 'ok' })).toEqual({
      name: 'ok',
      type: { type: 'boolean' },
    });
  });

  it('is a no-op over an empty integrations list', () => {
    expect(() => registerIntegrationScopeContributors([], neverCalledRegister)).not.toThrow();
  });
});
