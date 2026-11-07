import { describe, expect, it } from 'vitest';
import { sqlFilterStructTypes } from '@falang/workflow-integrations-sql-common';
import { TABLES_VENDOR } from './constants.js';
import { tablesIntegration } from './tables.integration.js';

describe('tablesIntegration skeleton', () => {
  it('is a credential-free vendor `tables` with notes and the shared filter structs', () => {
    expect(tablesIntegration.vendor).toBe(TABLES_VENDOR);
    expect(tablesIntegration.credentialFields).toEqual([]);
    expect(tablesIntegration.notes.length).toBeGreaterThan(20);
    expect(tablesIntegration.types).toEqual(sqlFilterStructTypes);
    expect(tablesIntegration.actions).toEqual([]);
    expect(tablesIntegration.triggers).toEqual([]);
  });
});
