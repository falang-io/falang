import { describe, expect, it } from 'vitest';
import type { Piece } from '@activepieces/pieces-framework';
import { selectPieceAuth } from './select-auth.js';

const asPiece = (auth: unknown): Piece => ({ auth }) as unknown as Piece;

describe('selectPieceAuth', () => {
  it('returns a single auth definition as-is', () => {
    const auth = { type: 'SECRET_TEXT', displayName: 'API key' };
    expect(selectPieceAuth('single', asPiece(auth))).toBe(auth);
  });

  it('returns undefined for a piece without auth', () => {
    expect(selectPieceAuth('none', asPiece(undefined))).toBeUndefined();
  });

  it('picks the first declared method of a multi-auth piece when no override is registered', () => {
    const oauth = { type: 'OAUTH2', displayName: 'Connection' };
    const token = { type: 'CUSTOM_AUTH', displayName: 'Bot Token' };
    expect(selectPieceAuth('unknown-piece', asPiece([oauth, token]))).toBe(oauth);
  });

  it('picks the overridden method by displayName for a registered piece (slack -> Bot Token)', () => {
    const oauth = { type: 'OAUTH2', displayName: 'Connection' };
    const token = { type: 'CUSTOM_AUTH', displayName: 'Bot Token' };
    expect(selectPieceAuth('slack', asPiece([oauth, token]))).toBe(token);
  });

  it('throws when the overridden method is missing from the installed piece, naming what is available', () => {
    const oauth = { type: 'OAUTH2', displayName: 'Connection' };
    expect(() => selectPieceAuth('slack', asPiece([oauth]))).toThrow(/"Bot Token".*available: "Connection"/);
  });
});
