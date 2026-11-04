import { describe, expect, it } from 'vitest';
import type { IArduinoCoreStatus } from '../shared/arduino-core-ipc-types.js';
import { decideCoreGate } from './core-gate.js';

const status = (overrides: Partial<IArduinoCoreStatus>): IArduinoCoreStatus => ({
  platformId: 'arduino:avr',
  boardLabel: 'Arduino Uno',
  installed: false,
  cliAvailable: true,
  ...overrides,
});

describe('decideCoreGate', () => {
  it('refuses when the CLI works and the core is missing', () => {
    const outcome = decideCoreGate(status({}));
    expect(outcome).toMatchObject({ stage: 'core-missing', platformId: 'arduino:avr', boardLabel: 'Arduino Uno' });
    expect(outcome?.message).toContain('arduino:avr');
    expect(outcome?.message).toContain('Arduino Uno');
  });

  it('lets an installed core through', () => {
    expect(decideCoreGate(status({ installed: true, version: '1.8.6' }))).toBeNull();
  });

  it('does not block when there is no CLI (the normal path reports it)', () => {
    expect(decideCoreGate(status({ cliAvailable: false }))).toBeNull();
  });

  it('does not block when the core list could not be read', () => {
    expect(decideCoreGate(status({ error: 'boom' }))).toBeNull();
  });

  it('does not block a malformed fqbn', () => {
    expect(decideCoreGate(status({ platformId: null }))).toBeNull();
  });
});
