import { describeFieldForAgent } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { buildSqlActions } from './build-sql-integration.js';

const fieldOf = (dialect: 'postgres' | 'mysql', action: string, field: string) => {
  const descriptor = buildSqlActions(dialect, { vendor: dialect, activityPrefix: dialect }).find(
    (candidate) => candidate.name === `${dialect}-${action}`,
  );
  const config = descriptor?.fields.find((candidate) => candidate.name === field);
  if (!config) throw new Error(`no ${field} on ${dialect}-${action}`);
  return config;
};

describe('SQL field agent notes', () => {
  it('explains the where object syntax and warns against a comparison', () => {
    const description = describeFieldForAgent(fieldOf('postgres', 'select', 'where'));
    expect(description).toContain('{ age: { gt: 18 } }');
    expect(description).toContain('Never write a comparison');
    expect(description).toContain('Empty — no filter');
  });

  it('says where is required on update/delete', () => {
    expect(describeFieldForAgent(fieldOf('postgres', 'delete', 'where'))).toContain('{ id: { isNull: false } }');
  });

  it('names the dialect placeholders for raw SQL', () => {
    expect(describeFieldForAgent(fieldOf('postgres', 'query', 'sql'))).toContain('$1, $2');
    expect(describeFieldForAgent(fieldOf('mysql', 'query', 'sql'))).toContain('?, ?');
  });
});
