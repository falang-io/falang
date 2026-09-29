import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { mediaActions } from './actions.js';
import {
  MEDIA_AUDIO_CONVERT_ACTION_NAME,
  MEDIA_AUDIO_EXTRACT_ACTION_NAME,
  MEDIA_IMAGE_CONVERT_ACTION_NAME,
  MEDIA_IMAGE_RESIZE_ACTION_NAME,
  MEDIA_PROBE_ACTION_NAME,
  MEDIA_VIDEO_CONCAT_ACTION_NAME,
  MEDIA_VIDEO_THUMBNAIL_ACTION_NAME,
  MEDIA_VIDEO_TRANSCODE_ACTION_NAME,
  MEDIA_VIDEO_TRIM_ACTION_NAME,
} from './constants.js';
import { mediaIntegration } from './media.integration.js';

const findAction = (name: string) => {
  const action = mediaActions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`expected action "${name}" to be registered`);
  return action;
};

describe('mediaActions', () => {
  it('produces valid node configs for every action through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([mediaIntegration]);
    expect(configs.map((config) => config.name).toSorted()).toEqual(
      [
        MEDIA_PROBE_ACTION_NAME,
        MEDIA_IMAGE_RESIZE_ACTION_NAME,
        MEDIA_IMAGE_CONVERT_ACTION_NAME,
        MEDIA_VIDEO_TRIM_ACTION_NAME,
        MEDIA_VIDEO_CONCAT_ACTION_NAME,
        MEDIA_VIDEO_THUMBNAIL_ACTION_NAME,
        MEDIA_VIDEO_TRANSCODE_ACTION_NAME,
        MEDIA_AUDIO_EXTRACT_ACTION_NAME,
        MEDIA_AUDIO_CONVERT_ACTION_NAME,
      ].toSorted(),
    );
  });

  it('every action accepts its declared fields through the generic data schema', () => {
    for (const action of mediaActions) {
      const config = buildActionNodeConfig(action);
      const values = Object.fromEntries(
        action.fields.map((field) => [field.name, field.name === 'file' ? 'input' : '']),
      );
      expect(config.data?.type.parse(values)).toEqual(values);
    }
  });

  describe('media-probe', () => {
    const action = findAction(MEDIA_PROBE_ACTION_NAME);

    it('emit assigns the result', () => {
      expect(action.emit({ file: 'input', resultVariable: 'info' })).toBe('const info = await mediaProbe(input);');
    });

    it('resultType is the MediaInfo struct', () => {
      expect(action.resultType).toEqual({ type: 'struct', id: 'media/MediaInfo' });
    });
  });

  describe('media-image-resize', () => {
    const action = findAction(MEDIA_IMAGE_RESIZE_ACTION_NAME);

    it('emit passes every field through, empty ones included', () => {
      const emitted = action.emit({
        file: 'input',
        width: '"800"',
        height: '""',
        fit: '"cover"',
        format: '"webp"',
        quality: '"90"',
        resultVariable: 'resized',
      });
      expect(emitted).toBe('const resized = await mediaImageResize(input, "800", "", "cover", "webp", "90");');
    });
  });

  describe('media-video-concat', () => {
    const action = findAction(MEDIA_VIDEO_CONCAT_ACTION_NAME);

    it('accepts a files array expression, not a single file', () => {
      expect(action.fields.some((field) => field.name === 'files')).toBe(true);
      expect(action.fields.some((field) => field.name === 'file')).toBe(false);
    });

    it('emit compiles the files expression and the boolean flag verbatim', () => {
      expect(action.emit({ files: 'clips', reencode: '"true"', resultVariable: 'merged' })).toBe(
        'const merged = await mediaVideoConcat(clips, "true");',
      );
    });
  });

  describe('media-video-thumbnail', () => {
    const action = findAction(MEDIA_VIDEO_THUMBNAIL_ACTION_NAME);

    it('emit with no result variable produces a bare statement', () => {
      expect(action.emit({ file: 'video', at: '"5"', width: '', resultVariable: '' })).toBe(
        'await mediaVideoThumbnail(video, "5", );',
      );
    });
  });

  describe('media-audio-convert', () => {
    const action = findAction(MEDIA_AUDIO_CONVERT_ACTION_NAME);

    it('has the full param set (format/bitrate/mono/sampleRate)', () => {
      expect(action.fields.map((field) => field.name)).toEqual([
        'file',
        'format',
        'bitrate',
        'mono',
        'sampleRate',
        'resultVariable',
      ]);
    });
  });

  it('every action is a 30-minute regular activity with a heartbeat timeout', () => {
    for (const action of mediaActions) {
      expect(action.activityOptions).toEqual({
        kind: 'regular',
        startToCloseTimeout: '30 minutes',
        heartbeatTimeout: '1 minute',
      });
    }
  });

  it('no activitySignature references IFileRef/IMediaInfo by name (must inline the shape instead)', () => {
    for (const action of mediaActions) {
      expect(action.activitySignature).not.toContain('IFileRef');
      expect(action.activitySignature).not.toContain('IMediaInfo');
    }
  });
});
