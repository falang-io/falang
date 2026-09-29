import {
  buildActionNodeConfig,
  describeFieldForAgent,
  getIntegrationNodeConfigs,
} from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  FILES_DELETE_ACTION_NAME,
  FILES_DOWNLOAD_ACTION_NAME,
  FILES_FROM_TEXT_ACTION_NAME,
  FILES_INFO_ACTION_NAME,
  FILES_PUBLISH_ACTION_NAME,
  FILES_READ_TEXT_ACTION_NAME,
  FILES_UNPUBLISH_ACTION_NAME,
  FILES_VENDOR,
} from './constants.js';
import { fileArrayTypeInfo, fileTypeInfo, filesFileType } from './file-types.js';
import { filesIntegration } from './files.integration.js';

const findAction = (name: string) => {
  const action = filesIntegration.actions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`expected action "${name}" to be registered`);
  return action;
};

describe('filesIntegration', () => {
  it('produces valid node configs for every action through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([filesIntegration]);
    expect(configs.map((config) => config.name).toSorted()).toEqual(
      [
        FILES_DOWNLOAD_ACTION_NAME,
        FILES_FROM_TEXT_ACTION_NAME,
        FILES_READ_TEXT_ACTION_NAME,
        FILES_DELETE_ACTION_NAME,
        FILES_INFO_ACTION_NAME,
        FILES_PUBLISH_ACTION_NAME,
        FILES_UNPUBLISH_ACTION_NAME,
      ].toSorted(),
    );
  });

  it('declares no credential fields and no triggers — usable without configuring an instance first', () => {
    expect(filesIntegration.credentialFields).toEqual([]);
    expect(filesIntegration.triggers).toEqual([]);
  });

  it('registers the files/File struct type', () => {
    expect(filesIntegration.types).toEqual([filesFileType]);
  });

  it('has a required, non-empty vendor-level notes string mentioning file/download/upload keywords', () => {
    expect(filesIntegration.notes.length).toBeGreaterThan(0);
    const lower = filesIntegration.notes.toLowerCase();
    expect(lower).toContain('file');
    expect(lower).toContain('download');
    expect(lower).toContain('upload');
  });

  it('vendor id is "files"', () => {
    expect(filesIntegration.vendor).toBe(FILES_VENDOR);
  });

  it('every action accepts its declared fields through the generic data schema', () => {
    const config = buildActionNodeConfig(findAction(FILES_DOWNLOAD_ACTION_NAME));
    const parsed = config.data?.type.parse({
      url: '`https://example.test/report.pdf`',
      headers: '',
      name: '`report.pdf`',
      ttlHours: '24',
      resultVariable: 'file1',
    });
    expect(parsed).toEqual({
      url: '`https://example.test/report.pdf`',
      headers: '',
      name: '`report.pdf`',
      ttlHours: '24',
      resultVariable: 'file1',
    });
  });

  describe('files-download', () => {
    const action = findAction(FILES_DOWNLOAD_ACTION_NAME);

    it('emit() replaces empty headers with the literal undefined and assigns the result', () => {
      const emitted = action.emit({
        url: '`https://example.test/report.pdf`',
        headers: '',
        name: '``',
        ttlHours: '"24"',
        resultVariable: 'file1',
      });
      expect(emitted).toBe(
        'const file1 = await filesDownload(`https://example.test/report.pdf`, undefined, ``, "24");',
      );
    });

    it('emit() omits the assignment when resultVariable is empty', () => {
      const emitted = action.emit({
        url: '`https://example.test/report.pdf`',
        headers: "{ Accept: 'application/pdf' }",
        name: '``',
        ttlHours: '""',
        resultVariable: '',
      });
      expect(emitted).toBe(
        'await filesDownload(`https://example.test/report.pdf`, { Accept: \'application/pdf\' }, ``, "");',
      );
    });

    it('resultType is the File struct', () => {
      expect(action.resultType).toEqual(fileTypeInfo());
    });

    it('activityOptions is a 10-minute regular activity with a 1-minute heartbeat', () => {
      expect(action.activityOptions).toEqual({
        kind: 'regular',
        startToCloseTimeout: '10 minutes',
        heartbeatTimeout: '1 minute',
      });
    });

    it('activityCode calls uploadFileFromStream and heartbeats', () => {
      expect(action.activityCode).toContain('export const filesDownload');
      expect(action.activityCode).toContain('uploadFileFromStream(response.body');
      expect(action.activityCode).toContain('heartbeat();');
    });
  });

  describe('files-from-text', () => {
    const action = findAction(FILES_FROM_TEXT_ACTION_NAME);

    it('emit() passes every field through positionally', () => {
      const emitted = action.emit({
        text: "'hello'",
        name: '`greeting.txt`',
        mime: '""',
        ttlHours: '""',
        resultVariable: 'file1',
      });
      expect(emitted).toBe('const file1 = await filesFromText(\'hello\', `greeting.txt`, "", "");');
    });

    it('resultType is the File struct', () => {
      expect(action.resultType).toEqual(fileTypeInfo());
    });
  });

  describe('files-read-text', () => {
    const action = findAction(FILES_READ_TEXT_ACTION_NAME);

    it("field's expectedType is the File struct", () => {
      const fileField = action.fields.find((field) => field.name === 'file');
      expect(fileField?.expectedType).toEqual(fileTypeInfo());
    });

    it('emit() assigns the decoded text to resultVariable', () => {
      const emitted = action.emit({ file: 'myFile', maxBytes: '"2048"', resultVariable: 'text1' });
      expect(emitted).toBe('const text1 = await filesReadText(myFile, "2048");');
    });

    it('resultType is a plain string', () => {
      expect(action.resultType).toEqual({ type: 'string' });
    });
  });

  describe('files-delete', () => {
    const action = findAction(FILES_DELETE_ACTION_NAME);

    it('has no new-variable field — nothing is captured', () => {
      expect(action.fields.some((field) => field.kind === 'new-variable')).toBe(false);
    });

    it('emit() never assigns', () => {
      expect(action.emit({ file: 'myFile' })).toBe('await filesDelete(myFile);');
    });

    it('activityOptions is a quick 1-minute regular activity with no heartbeat', () => {
      expect(action.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '1 minute' });
    });
  });

  describe('files-info', () => {
    const action = findAction(FILES_INFO_ACTION_NAME);

    it("fileId field's expectedType is a plain string, not the File struct", () => {
      const fileIdField = action.fields.find((field) => field.name === 'fileId');
      expect(fileIdField?.expectedType).toEqual({ type: 'string' });
    });
  });

  describe('files-publish / files-unpublish', () => {
    it('both resolve resultType to the File struct', () => {
      expect(findAction(FILES_PUBLISH_ACTION_NAME).resultType).toEqual(fileTypeInfo());
      expect(findAction(FILES_UNPUBLISH_ACTION_NAME).resultType).toEqual(fileTypeInfo());
    });
  });

  it('sharedActivityCode imports the package helpers, not a duplicated implementation', () => {
    expect(filesIntegration.sharedActivityCode).toContain(
      "import type { IFileRef } from '@falang/workflow-integrations-files';",
    );
    expect(filesIntegration.sharedActivityCode).toContain('uploadFileFromStream');
    expect(filesIntegration.sharedActivityCode).toContain("import { heartbeat } from '@temporalio/activity';");
  });
});

describe('describeFieldForAgent for File-typed fields', () => {
  it('tells the agent a File-typed expression field is a reference, not a URL', () => {
    const fileField = findAction(FILES_DELETE_ACTION_NAME).fields.find((field) => field.name === 'file');
    if (!fileField) throw new Error('expected a "file" field');
    const description = describeFieldForAgent(fileField);
    expect(description).toContain('File reference (struct files/File)');
    expect(description).toContain('never a URL string');
    expect(description).toContain('files-download');
  });

  it('also flags an array of Files (e.g. a future attachments field)', () => {
    const description = describeFieldForAgent({
      name: 'attachments',
      label: 'Attachments',
      kind: 'expression',
      expectedType: fileArrayTypeInfo(),
    });
    expect(description).toContain('File reference (struct files/File)');
  });

  it('leaves a non-File expected type undecorated', () => {
    const fileIdField = findAction(FILES_INFO_ACTION_NAME).fields.find((field) => field.name === 'fileId');
    if (!fileIdField) throw new Error('expected a "fileId" field');
    expect(describeFieldForAgent(fileIdField)).not.toContain('File reference');
  });
});
