import type { ISqlDialect } from './query-builder.js';
import type { TSqlDialectName } from './schema-types.js';

export const postgresDialect: ISqlDialect = {
  name: 'postgres',
  quoteIdent: (name) => `"${name.replaceAll('"', '""')}"`,
  placeholder: (index) => `$${index}`,
  supportsReturning: true,
};

export const mysqlDialect: ISqlDialect = {
  name: 'mysql',
  quoteIdent: (name) => `\`${name.replaceAll('`', '``')}\``,
  placeholder: () => '?',
  supportsReturning: false,
};

/** SQLite supports `RETURNING` since 3.35 (ADR 0039 (private) §1) — the bundled `node:sqlite` is well past that. */
export const sqliteDialect: ISqlDialect = {
  name: 'sqlite',
  quoteIdent: (name) => `"${name.replaceAll('"', '""')}"`,
  placeholder: () => '?',
  supportsReturning: true,
};

export const dialectByName = (name: TSqlDialectName): ISqlDialect => {
  switch (name) {
    case 'postgres': {
      return postgresDialect;
    }
    case 'mysql': {
      return mysqlDialect;
    }
    case 'sqlite': {
      return sqliteDialect;
    }
    default: {
      const exhaustive: never = name;
      throw new Error(`sql-common: unknown SQL dialect "${String(exhaustive)}"`);
    }
  }
};
