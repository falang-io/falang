import { NodesGroup, NodesStack } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { describeNodeKind } from './node-kinds.js';
import { SQL_VENDOR_NODE_KIND_NOTES, VENDOR_NODE_KIND_NOTES } from './node-kind-notes-vendors.js';

const SQL_DIALECT_VENDORS = ['postgres', 'mysql', 'sqlite'];
const SQL_ACTION_SUFFIXES = ['select', 'select-one', 'insert', 'update', 'delete', 'query'];

describe('node-kind-notes-vendors', () => {
  it('VENDOR_NODE_KIND_NOTES: has every telegram/AI/files/http entry moved out of node-kinds.ts', () => {
    expect(Object.keys(VENDOR_NODE_KIND_NOTES).toSorted()).toEqual(
      [
        'telegram-question',
        'telegram-question-option',
        'call-ai-choice',
        'call-ai-choice-option',
        'call-ai-text',
        'call-ai-image',
        'call-ai-transcribe',
        'files-download',
        'files-read-text',
        'files-publish',
        'http-request',
        'telegram-send-file',
        'media-probe',
        'media-image-resize',
        'media-image-convert',
        'media-video-trim',
        'media-video-concat',
        'media-video-thumbnail',
        'media-video-transcode',
        'media-audio-extract',
        'media-audio-convert',
        'human-task',
        'human-task-option',
      ].toSorted(),
    );
  });

  it('SQL_VENDOR_NODE_KIND_NOTES: has all six action notes for every SQL dialect vendor', () => {
    const expectedKeys = SQL_DIALECT_VENDORS.flatMap((vendor) =>
      SQL_ACTION_SUFFIXES.map((suffix) => `${vendor}-${suffix}`),
    );
    expect(Object.keys(SQL_VENDOR_NODE_KIND_NOTES).toSorted()).toEqual(expectedKeys.toSorted());
  });

  it('SQL_VENDOR_NODE_KIND_NOTES: *-select/*-update/*-delete explain the operator DSL and "Sync structure" prerequisite', () => {
    for (const vendor of SQL_DIALECT_VENDORS) {
      const selectNote = SQL_VENDOR_NODE_KIND_NOTES[`${vendor}-select`];
      expect(selectNote).toContain('operator DSL');
      expect(selectNote).toContain('in');
      expect(selectNote).toContain('Sync structure');
    }
  });

  it('SQL_VENDOR_NODE_KIND_NOTES: *-update/*-delete require a non-empty where', () => {
    for (const vendor of SQL_DIALECT_VENDORS) {
      expect(SQL_VENDOR_NODE_KIND_NOTES[`${vendor}-update`]).toContain('non-empty');
      expect(SQL_VENDOR_NODE_KIND_NOTES[`${vendor}-delete`]).toContain('non-empty');
    }
  });

  it('SQL_VENDOR_NODE_KIND_NOTES: writes mention Temporal retries and an idempotency/unique-constraint concern', () => {
    for (const vendor of SQL_DIALECT_VENDORS) {
      for (const suffix of ['insert', 'update', 'delete', 'query']) {
        const note = SQL_VENDOR_NODE_KIND_NOTES[`${vendor}-${suffix}`];
        expect(note).toContain('Retries');
        expect(note).toContain('idempotency');
      }
    }
  });

  it('SQL_VENDOR_NODE_KIND_NOTES: only sqlite carries the local/dev-only caveat', () => {
    expect(SQL_VENDOR_NODE_KIND_NOTES['sqlite-select']).toContain('local/dev-only');
    expect(SQL_VENDOR_NODE_KIND_NOTES['postgres-select']).not.toContain('local/dev-only');
    expect(SQL_VENDOR_NODE_KIND_NOTES['mysql-select']).not.toContain('local/dev-only');
  });

  it("describeNodeKind: picks up a vendor/SQL note through node-kinds.ts' merged lookup, for a node kind this package has no static knowledge of", () => {
    const stack = new NodesStack([new NodesGroup([{ name: 'postgres-update' }, { name: 'telegram-question' }])]);
    expect(describeNodeKind('postgres-update', stack).notes).toContain('non-empty');
    expect(describeNodeKind('telegram-question', stack).notes).toContain('inline-keyboard');
  });
});
