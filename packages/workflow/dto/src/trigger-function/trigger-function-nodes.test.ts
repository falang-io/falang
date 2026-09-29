import { describe, expect, it } from 'vitest';
import {
  TRIGGER_FUNCTION_BODY_NAME,
  TRIGGER_FUNCTION_NAME,
  triggerFunctionBodyDataType,
  triggerFunctionNodesGroup,
} from './trigger-function-nodes.js';

describe('triggerFunctionNodesGroup', () => {
  it('registers the root and body node kinds', () => {
    expect(triggerFunctionNodesGroup.map((config) => config.name)).toEqual([
      TRIGGER_FUNCTION_NAME,
      TRIGGER_FUNCTION_BODY_NAME,
    ]);
  });

  it('reuses function-header/function-footer by name in its childTuple, not new node kinds', () => {
    const root = triggerFunctionNodesGroup.find((config) => config.name === TRIGGER_FUNCTION_NAME);
    expect(root?.childTuple).toEqual(['function-header', TRIGGER_FUNCTION_BODY_NAME, 'function-footer']);
  });

  it('the body node kind is an ordinary, unrestricted array — no fixed/protected child', () => {
    const body = triggerFunctionNodesGroup.find((config) => config.name === TRIGGER_FUNCTION_BODY_NAME);
    expect(body?.children).toBe(true);
  });

  it('factory builds header/body/footer with an empty, ordinary body', () => {
    const root = triggerFunctionNodesGroup.find((config) => config.name === TRIGGER_FUNCTION_NAME);
    const node = root?.factory?.();
    expect(node?.children?.map((child) => child.name)).toEqual([
      'function-header',
      TRIGGER_FUNCTION_BODY_NAME,
      'function-footer',
    ]);
    const body = node?.children?.find((child) => child.name === TRIGGER_FUNCTION_BODY_NAME);
    expect(body?.children).toEqual([]);
    expect(body?.data).toEqual({
      vendor: '',
      triggerName: '',
      credentialId: '',
      scopeVariableName: '',
      scopeType: { type: 'any' },
    });
  });
});

describe('triggerFunctionBodyDataType', () => {
  it('accepts a vendor/triggerName/credentialId/scopeVariableName/scopeType reference with no returnValue', () => {
    expect(
      triggerFunctionBodyDataType.type.parse({
        vendor: 'telegram',
        triggerName: 'telegram-trigger',
        credentialId: 'cred-1',
        scopeVariableName: 'message',
        scopeType: { type: 'struct', id: 'telegram/Message' },
      }),
    ).toEqual({
      vendor: 'telegram',
      triggerName: 'telegram-trigger',
      credentialId: 'cred-1',
      scopeVariableName: 'message',
      scopeType: { type: 'struct', id: 'telegram/Message' },
    });
  });

  it('rejects data missing vendor/triggerName/credentialId/scopeVariableName/scopeType', () => {
    expect(() => triggerFunctionBodyDataType.type.parse({})).toThrow();
  });

  it('accepts an optional triggerConfig record, e.g. an on-command trigger\'s configured command name', () => {
    expect(
      triggerFunctionBodyDataType.type.parse({
        vendor: 'telegram',
        triggerName: 'telegram-on-command-trigger',
        credentialId: 'cred-1',
        scopeVariableName: 'message',
        scopeType: { type: 'struct', id: 'telegram/Message' },
        triggerConfig: { command: '/start' },
      }),
    ).toMatchObject({ triggerConfig: { command: '/start' } });
  });

  it('has no `parameters` field, unlike a plain function-body — trigger identity lives here instead', () => {
    expect(triggerFunctionBodyDataType.default()).toEqual({
      vendor: '',
      triggerName: '',
      credentialId: '',
      scopeVariableName: '',
      scopeType: { type: 'any' },
    });
  });
});
