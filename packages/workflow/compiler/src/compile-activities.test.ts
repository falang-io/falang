import { describe, expect, it } from 'vitest';
import { compileActivities } from './compile-activities.js';

describe('compileActivities', () => {
  it('emits logActivity, importing log from @temporalio/activity and returning the message', () => {
    const result = compileActivities();
    expect(result).toContain("import { log } from '@temporalio/activity';");
    expect(result).toContain('export const logActivity = (message: string): string => {');
    expect(result).toContain('  log.info(message);');
    expect(result).toContain('  return message;');
  });

  it('exports runActivepiecesAction so it lands on the Worker activities namespace object', () => {
    const result = compileActivities();
    expect(result).toContain('export const runActivepiecesAction = async (');
  });

  it('folds in every extra activity code fragment alongside logActivity', () => {
    const result = compileActivities(['export const foo = () => {};', 'export const bar = () => {};']);
    expect(result).toContain('export const logActivity');
    expect(result).toContain('export const foo = () => {};');
    expect(result).toContain('export const bar = () => {};');
  });

  it('emits only logActivity when no extra activity code is given', () => {
    expect(compileActivities([])).toBe(compileActivities());
  });

  it('hoists and deduplicates identical import lines shared by two extra activity code blocks', () => {
    // Mirrors amoCRM's and Diadoc's real `sharedActivityCode` (ADR 0017 (private)): both start
    // with the exact same import, which throws `Duplicate identifier` from `typeCheckProject` once
    // concatenated verbatim — see ADR 0025 (private)'s package F implementation notes.
    const fakeIntegrationA = [
      "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
      '',
      "export const resolveFakeAField = () => resolveOAuth2AccessToken('a', 'cred', {} as never);",
    ].join('\n');
    const fakeIntegrationB = [
      "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
      '',
      "export const resolveFakeBField = () => resolveOAuth2AccessToken('b', 'cred', {} as never);",
    ].join('\n');

    const result = compileActivities([fakeIntegrationA, fakeIntegrationB]);

    const occurrences =
      result.split("import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';").length - 1;
    expect(occurrences).toBe(1);
    expect(result).toContain('export const resolveFakeAField');
    expect(result).toContain('export const resolveFakeBField');
    // The hoisted import lands ahead of every block's own body.
    expect(result.indexOf('resolveOAuth2AccessToken')).toBeLessThan(result.indexOf('export const resolveFakeAField'));
  });

  it('handles a multi-line `import { … } from …;` statement as one unit', () => {
    const block = [
      'import {',
      '  resolveOAuth2AccessToken,',
      "} from '@falang/workflow-integrations-common';",
      '',
      'export const foo = () => resolveOAuth2AccessToken;',
    ].join('\n');

    const result = compileActivities([block, block]);

    const occurrences = result.split('resolveOAuth2AccessToken,').length - 1;
    expect(occurrences).toBe(1);
  });
});
