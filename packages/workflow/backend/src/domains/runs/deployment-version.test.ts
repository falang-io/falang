import { defaultPayloadConverter } from '@temporalio/common';
import { describe, expect, it } from 'vitest';
import {
  DEPLOYMENT_VERSION_SEARCH_ATTRIBUTE,
  buildIdFromDeploymentVersion,
  buildIdFromSearchAttributes,
} from './deployment-version.js';

const PROJECT = '0b6c4f0e-3a51-4e0f-9b8e-2d1f6a7c9e10';

describe('buildIdFromDeploymentVersion', () => {
  it('reads the build id from the current `<deployment>:<buildId>` format', () => {
    expect(buildIdFromDeploymentVersion(`workflow-${PROJECT}:v3`)).toBe('v3');
  });

  it('reads the build id from the older `<deployment>.<buildId>` format', () => {
    expect(buildIdFromDeploymentVersion(`workflow-${PROJECT}.v12`)).toBe('v12');
  });

  it('returns null for unversioned or empty values', () => {
    expect(buildIdFromDeploymentVersion('__unversioned__')).toBeNull();
    expect(buildIdFromDeploymentVersion('')).toBeNull();
    expect(buildIdFromDeploymentVersion(null)).toBeNull();
    expect(buildIdFromDeploymentVersion(`workflow-${PROJECT}:`)).toBeNull();
  });
});

describe('buildIdFromSearchAttributes', () => {
  const attributes = (value: unknown) => ({
    indexedFields: { [DEPLOYMENT_VERSION_SEARCH_ATTRIBUTE]: defaultPayloadConverter.toPayload(value) },
  });

  it('decodes a keyword stored as a plain string', () => {
    expect(buildIdFromSearchAttributes(attributes(`workflow-${PROJECT}:v2`))).toBe('v2');
  });

  it('decodes a keyword stored as a one-element list', () => {
    expect(buildIdFromSearchAttributes(attributes([`workflow-${PROJECT}:v5`]))).toBe('v5');
  });

  it('returns null when the attribute is absent', () => {
    expect(buildIdFromSearchAttributes(null)).toBeNull();
    expect(buildIdFromSearchAttributes({ indexedFields: {} })).toBeNull();
  });
});
