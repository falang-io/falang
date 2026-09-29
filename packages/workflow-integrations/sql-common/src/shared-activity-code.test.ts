import { describe, expect, it } from 'vitest';
import { buildSqlSharedActivityCode } from './shared-activity-code.js';

describe('buildSqlSharedActivityCode', () => {
  it('postgres: imports pg lazily, exports the six action functions, and imports the query builder', () => {
    const code = buildSqlSharedActivityCode('postgres');
    expect(code).toContain("await import('pg')");
    for (const fn of [
      'postgresSelect',
      'postgresSelectOne',
      'postgresInsert',
      'postgresUpdate',
      'postgresDelete',
      'postgresQuery',
    ]) {
      expect(code).toContain(`export const ${fn} =`);
    }
    expect(code).toContain(
      "import { buildDelete, buildInsert, buildSelect, buildUpdate, dialectByName } from '@falang/workflow-integrations-sql-common';",
    );
    expect(code).toContain("dialectByName('postgres')");
    expect(code).toContain("import { ApplicationFailure } from '@temporalio/activity';");
    expect(code).not.toContain("import('mysql2/promise')");
    expect(code).not.toContain("import('node:sqlite')");
  });

  it('mysql: imports mysql2/promise lazily, not pg or node:sqlite', () => {
    const code = buildSqlSharedActivityCode('mysql');
    expect(code).toContain("await import('mysql2/promise')");
    expect(code).not.toContain("await import('pg')");
    expect(code).not.toContain("import('node:sqlite')");
    for (const fn of ['mysqlSelect', 'mysqlSelectOne', 'mysqlInsert', 'mysqlUpdate', 'mysqlDelete', 'mysqlQuery']) {
      expect(code).toContain(`export const ${fn} =`);
    }
  });

  it(
    'mysql: the SET SESSION MAX_EXECUTION_TIME connection hook uses the callback form, not ' +
      '`.catch()` — the pool\'s \'connection\' event actually hands back mysql2\'s raw callback-API ' +
      'connection (a real live-e2e bug: "connection.query(...).catch is not a function")',
    () => {
      const code = buildSqlSharedActivityCode('mysql');
      expect(code).not.toMatch(/connection\.query\([^)]*\)\.catch\(/);
      expect(code).toContain("(connection as any).query('SET SESSION MAX_EXECUTION_TIME=50000', () => {");
    },
  );

  it(
    'mysql: never imports the bare, callback-API "mysql2" package (only the promise-API ' +
      '"mysql2/promise") — a real live-e2e bug (`.then()`/`await` on a non-promise query result) ' +
      'came from `createPool` being built off the wrong one',
    () => {
      const code = buildSqlSharedActivityCode('mysql');
      // `'mysql2/promise'` itself contains `'mysql2'` as a substring, so this can't be a plain
      // `not.toContain("'mysql2'")` — it has to specifically rule out a bare module specifier.
      expect(code).not.toMatch(/from\s+['"]mysql2['"]/);
      expect(code).not.toMatch(/import\(['"]mysql2['"]\)/);
      expect(code).not.toMatch(/require\(['"]mysql2['"]\)/);
      // The promise-API pool is awaited directly, and a query result is destructured as the
      // `[rows-or-ResultSetHeader, fields]` tuple `mysql2/promise` returns — not passed a callback.
      expect(code).toContain('await pool.query(sql, params as unknown[])');
    },
  );

  it('sqlite: imports node:sqlite lazily, not pg or mysql2', () => {
    const code = buildSqlSharedActivityCode('sqlite');
    expect(code).toContain("await import('node:sqlite')");
    expect(code).not.toContain("await import('pg')");
    expect(code).not.toContain("await import('mysql2/promise')");
    for (const fn of [
      'sqliteSelect',
      'sqliteSelectOne',
      'sqliteInsert',
      'sqliteUpdate',
      'sqliteDelete',
      'sqliteQuery',
    ]) {
      expect(code).toContain(`export const ${fn} =`);
    }
  });

  it("never imports a node:*/driver module at this function's own top level (only inside the returned string)", () => {
    const source = buildSqlSharedActivityCode.toString();
    expect(source).not.toMatch(/^import /m);
  });

  it('resolves connectionString/ssl through the shared, real resolveSqlCredentialField export (vendor = dialect name)', () => {
    const code = buildSqlSharedActivityCode('mysql');
    expect(code).toContain("import { resolveSqlCredentialField } from '@falang/workflow-integrations-sql-common';");
    expect(code).toContain("resolveSqlCredentialField(credentialId, 'mysql', 'connectionString')");
    expect(code).toContain("resolveSqlCredentialField(credentialId, 'mysql', 'ssl', 'prefer')");
  });

  it('maps connection-severed errors to the SQL_UNCERTAIN failure type', () => {
    const code = buildSqlSharedActivityCode('postgres');
    expect(code).toContain('SQL_UNCERTAIN');
  });

  describe('every declared name is prefixed by dialect, so concatenating all three dialects never redeclares one identifier', () => {
    const bareNames = [
      'const dialect =',
      'const getPool =',
      'const runQuery =',
      'const mapSqlError =',
      'interface IRunQueryResult',
      'const UNCERTAIN_ERROR_CODES =',
    ];

    for (const dialectName of ['postgres', 'mysql', 'sqlite'] as const) {
      it(`${dialectName}: no bare (unprefixed) shared identifier`, () => {
        const code = buildSqlSharedActivityCode(dialectName);
        for (const bareName of bareNames) expect(code).not.toContain(bareName);
      });
    }

    it('concatenating postgres + mysql + sqlite never redeclares one top-level (module-scope) identifier', () => {
      // Only unindented lines are module-top-level once every dialect's own block is concatenated —
      // an identically-named `const` nested inside two distinctly-named functions (e.g. each dialect's
      // own `${prefix}Select` locally declaring `parsedLimit`) is NOT a collision, since it never
      // reaches module scope; this regex + the "no leading whitespace" check both matter.
      const topLevelDeclRe = /^(?:export )?(?:const|interface|async function|function)\s+([A-Za-z_$][\w$]*)/;
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const dialectName of ['postgres', 'mysql', 'sqlite'] as const) {
        for (const line of buildSqlSharedActivityCode(dialectName).split('\n')) {
          if (line.length === 0 || line !== line.trimStart()) continue;
          const match = topLevelDeclRe.exec(line);
          if (!match) continue;
          const [, name] = match;
          if (seen.has(name)) duplicates.push(name);
          seen.add(name);
        }
      }
      expect(duplicates).toEqual([]);
    });
  });
});
