import { describe, expect, it } from 'vitest';
import {
  MAX_CORE_OUTPUT_LINES,
  appendOutputLines,
  buildSettingsInput,
  cliAlertKind,
  describeDownloadProgress,
  needsDownloadBeforeSave,
  shouldOfferCliUpdate,
} from './arduino-cli-ui-model.js';
import type { IArduinoCliFullStatus } from '../../shared/arduino-cli-ipc-types.js';

const status = (patch: Partial<IArduinoCliFullStatus>): IArduinoCliFullStatus => ({
  available: true,
  source: 'system',
  serialMonitorSupported: true,
  busy: null,
  ...patch,
});

describe('cliAlertKind', () => {
  it('maps the problem to an alert and nothing when available', () => {
    expect(cliAlertKind(null)).toBe('none');
    expect(cliAlertKind(status({}))).toBe('none');
    expect(cliAlertKind(status({ available: false, problem: 'custom-missing' }))).toBe('custom-missing');
    expect(cliAlertKind(status({ available: false, problem: 'managed-missing' }))).toBe('managed-missing');
    expect(cliAlertKind(status({ available: false }))).toBe('not-found');
  });
});

describe('shouldOfferCliUpdate', () => {
  it('only for a managed CLI with a newer version', () => {
    expect(shouldOfferCliUpdate(status({ source: 'managed', updateAvailable: true, latestVersion: '1.5.0' }))).toBe(
      true,
    );
    expect(shouldOfferCliUpdate(status({ source: 'managed', updateAvailable: false }))).toBe(false);
    expect(shouldOfferCliUpdate(status({ source: 'system', updateAvailable: true, latestVersion: '1.5.0' }))).toBe(
      false,
    );
    expect(shouldOfferCliUpdate(null)).toBe(false);
  });
});

describe('describeDownloadProgress', () => {
  it('shows a percentage when the total is known', () => {
    expect(
      describeDownloadProgress({ phase: 'download', received: 10 * 1024 * 1024, total: 40 * 1024 * 1024 }),
    ).toEqual({
      percent: 25,
      text: '10.0 MB / 40.0 MB',
    });
  });
  it('has no percentage without a total', () => {
    expect(describeDownloadProgress({ phase: 'download', received: 1024 * 1024 })).toEqual({
      percent: null,
      text: '1.0 MB',
    });
  });
});

describe('settings form', () => {
  it('sends the custom path only for the custom source', () => {
    expect(buildSettingsInput({ source: 'custom', customPath: ' /a/b ', checkUpdates: true })).toEqual({
      source: 'custom',
      customPath: '/a/b',
      checkUpdates: true,
    });
    expect(buildSettingsInput({ source: 'system', customPath: '/a/b', checkUpdates: false })).toEqual({
      source: 'system',
      checkUpdates: false,
    });
  });
  it('downloads first when managed is chosen with nothing downloaded', () => {
    const form = { source: 'managed', customPath: '', checkUpdates: true } as const;
    expect(needsDownloadBeforeSave(form, status({}))).toBe(true);
    expect(needsDownloadBeforeSave(form, status({ managedVersion: '1.4.1' }))).toBe(false);
    expect(needsDownloadBeforeSave({ ...form, source: 'system' }, status({}))).toBe(false);
  });
});

describe('appendOutputLines', () => {
  it('keeps the last lines only', () => {
    let lines: readonly string[] = [];
    for (let index = 0; index < MAX_CORE_OUTPUT_LINES + 5; index += 1) lines = appendOutputLines(lines, `l${index}`);
    expect(lines).toHaveLength(MAX_CORE_OUTPUT_LINES);
    expect(lines[0]).toBe('l5');
    expect(lines.at(-1)).toBe(`l${MAX_CORE_OUTPUT_LINES + 4}`);
  });
});
