import { describeFieldForAgent } from '@falang/workflow-integrations-common';
import { fileArrayTypeInfo } from '@falang/workflow-integrations-files';
import { describe, expect, it } from 'vitest';
import { MEDIA_VENDOR } from './constants.js';
import { mediaInfoType } from './media-types.js';
import { mediaIntegration } from './media.integration.js';

describe('mediaIntegration', () => {
  it('declares no credential fields and no triggers — usable without configuring an instance first', () => {
    expect(mediaIntegration.credentialFields).toEqual([]);
    expect(mediaIntegration.triggers).toEqual([]);
  });

  it('registers the media/MediaInfo struct type', () => {
    expect(mediaIntegration.types).toEqual([mediaInfoType]);
  });

  it('vendor id is "media"', () => {
    expect(mediaIntegration.vendor).toBe(MEDIA_VENDOR);
  });

  it('has a required, non-empty vendor-level notes string mentioning ffmpeg/video/audio keywords', () => {
    expect(mediaIntegration.notes.length).toBeGreaterThan(0);
    const lower = mediaIntegration.notes.toLowerCase();
    expect(lower).toContain('ffmpeg');
    expect(lower).toContain('video');
    expect(lower).toContain('audio');
    expect(lower).toContain('thumbnail');
  });

  it('sharedActivityCode imports runMediaJob and both temporalio/activity import lines coexist without redeclaring heartbeat', () => {
    expect(mediaIntegration.sharedActivityCode).toContain("import { heartbeat } from '@temporalio/activity';");
    expect(mediaIntegration.sharedActivityCode).toContain(
      "import { activityInfo, cancellationSignal } from '@temporalio/activity';",
    );
    expect(mediaIntegration.sharedActivityCode).toContain('runMediaJob');
    expect(mediaIntegration.sharedActivityCode).toContain('mediaJobKey');
  });
});

describe('describeFieldForAgent for File-typed media fields', () => {
  it('tells the agent a File-typed expression field is a reference, not a URL', () => {
    const action = mediaIntegration.actions.find((candidate) => candidate.name === 'media-probe');
    const fileField = action?.fields.find((field) => field.name === 'file');
    if (!fileField) throw new Error('expected a "file" field on media-probe');
    const description = describeFieldForAgent(fileField);
    expect(description).toContain('File reference (struct files/File)');
    expect(description).toContain('never a URL string');
  });

  it('also flags the files array field on media-video-concat', () => {
    const description = describeFieldForAgent({
      name: 'files',
      label: 'media:field.files',
      kind: 'expression',
      expectedType: fileArrayTypeInfo(),
    });
    expect(description).toContain('File reference (struct files/File)');
  });
});
