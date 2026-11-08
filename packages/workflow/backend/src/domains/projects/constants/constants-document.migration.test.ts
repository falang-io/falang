import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import type { QueryRunner } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConstantsDocument1790240000000 } from '../../../migrations/1790240000000-ConstantsDocument.js';

// PGlite boots a WASM Postgres per test.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe('ConstantsDocument1790240000000', () => {
  // oxlint-disable-next-line init-declarations
  let db: PGlite;
  const runner = (): QueryRunner => ({ query: (sql: string) => db.query(sql) }) as unknown as QueryRunner;

  beforeEach(async () => {
    db = await PGlite.create({ extensions: { uuid_ossp } });
    await db.exec(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE "projects" ("id" uuid PRIMARY KEY, "name" varchar NOT NULL);
      CREATE TABLE "documents" ("id" uuid PRIMARY KEY, "type" varchar NOT NULL, "name" varchar NOT NULL,
        "folder_id" uuid, "project_id" uuid NOT NULL, "pinned" boolean NOT NULL DEFAULT false, "root" text, "data" text);
      INSERT INTO "projects" VALUES ('11111111-1111-4111-8111-111111111111', 'a'), ('22222222-2222-4222-8222-222222222222', 'b');
      INSERT INTO "documents" ("id", "type", "name", "project_id", "pinned", "data") VALUES
        ('33333333-3333-4333-8333-333333333333', 'constants', 'Constants', '22222222-2222-4222-8222-222222222222', true, '{"constants":[{"id":"c1"}]}');
    `);
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds an empty pinned Constants document to every project without one, once', async () => {
    const migration = new ConstantsDocument1790240000000();
    await migration.up(runner());
    await migration.up(runner());
    const rows = await db.query<{ project_id: string; name: string; pinned: boolean; folder_id: null; data: string }>(
      `SELECT "project_id", "name", "pinned", "folder_id", "data" FROM "documents" WHERE "type" = 'constants' ORDER BY "project_id"`,
    );
    expect(rows.rows).toEqual([
      {
        project_id: '11111111-1111-4111-8111-111111111111',
        name: 'Constants',
        pinned: true,
        folder_id: null,
        data: '{"constants":[]}',
      },
      {
        project_id: '22222222-2222-4222-8222-222222222222',
        name: 'Constants',
        pinned: true,
        folder_id: null,
        data: '{"constants":[{"id":"c1"}]}',
      },
    ]);
  });
});
