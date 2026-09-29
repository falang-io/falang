import { POSITION_FAILURE_TYPE } from '@falang/workflow-compiler';
import type { temporal } from '@temporalio/proto';
import { describe, expect, it } from 'vitest';
import { readFailureMessage, readFailurePosition } from './workflow-position.js';

type TFailure = temporal.api.failure.v1.IFailure;

// The tests stand in for Temporal's payload converter: a payload's `data` is the JSON to return.
const payloadOf = (value: unknown): temporal.api.common.v1.IPayload => ({
  data: new TextEncoder().encode(JSON.stringify(value)),
});
const decodePayloads = (payloads: temporal.api.common.v1.IPayloads | null | undefined): unknown => {
  const values = (payloads?.payloads ?? []).map((payload) =>
    JSON.parse(new TextDecoder().decode(payload.data as Uint8Array)),
  );
  return values.length === 1 ? values[0] : values;
};

describe('readFailurePosition', () => {
  it('reads the stack out of a FalangWorkflowFailure’s details', () => {
    const failure: TFailure = {
      message: 'boom',
      applicationFailureInfo: {
        type: POSITION_FAILURE_TYPE,
        details: { payloads: [payloadOf({ position: [{ documentId: 'd1', nodeId: 'n3' }] })] },
      },
    };
    expect(readFailurePosition(failure, decodePayloads)).toEqual({ position: [{ documentId: 'd1', nodeId: 'n3' }] });
  });

  it('walks the cause chain when the wrapper is nested under another failure', () => {
    const failure: TFailure = {
      message: 'outer',
      applicationFailureInfo: { type: 'SomethingElse' },
      cause: {
        message: 'boom',
        applicationFailureInfo: {
          type: POSITION_FAILURE_TYPE,
          details: {
            payloads: [
              payloadOf({
                position: [
                  { documentId: 'd1', nodeId: 'call' },
                  { documentId: 'd2', nodeId: null },
                ],
              }),
            ],
          },
        },
      },
    };
    expect(readFailurePosition(failure, decodePayloads)?.position).toHaveLength(2);
  });

  it('returns null for a failure without the wrapper (e.g. an artifact built before tracking existed)', () => {
    expect(readFailurePosition({ message: 'plain', applicationFailureInfo: { type: 'Error' } }, decodePayloads)).toBe(
      null,
    );
    expect(readFailurePosition(null, decodePayloads)).toBe(null);
  });

  it('returns null when the details are malformed rather than trusting them', () => {
    const failure: TFailure = {
      applicationFailureInfo: { type: POSITION_FAILURE_TYPE, details: { payloads: [payloadOf({ position: 'nope' })] } },
    };
    expect(readFailurePosition(failure, decodePayloads)).toBe(null);
  });
});

describe('readFailureMessage', () => {
  it('returns the failure message, or null when there is none', () => {
    expect(readFailureMessage({ message: 'boom' })).toBe('boom');
    expect(readFailureMessage({ message: '' })).toBeNull();
    expect(readFailureMessage(null)).toBeNull();
  });
});
