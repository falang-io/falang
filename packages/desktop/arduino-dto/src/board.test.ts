import { describe, expect, it } from 'vitest';
import {
  ARDUINO_BOARDS,
  DEFAULT_BOARD_FQBN,
  ESP32_PACKAGE_INDEX_URL,
  boardLabel,
  boardPackageIndexUrl,
  boardPlatformId,
} from './board.js';

describe('board', () => {
  it('DEFAULT_BOARD_FQBN is one of the catalog entries', () => {
    expect(ARDUINO_BOARDS.some((board) => board.fqbn === DEFAULT_BOARD_FQBN)).toBe(true);
  });

  it('boardLabel looks up a known fqbn', () => {
    expect(boardLabel('arduino:avr:uno')).toBe('Arduino Uno');
    expect(boardLabel('esp32:esp32:esp32')).toBe('ESP32 Dev Module');
  });

  it('boardLabel falls back to the raw fqbn for an unknown one', () => {
    expect(boardLabel('some:unknown:board')).toBe('some:unknown:board');
  });

  it('boardPlatformId takes the first two segments, null for a malformed fqbn', () => {
    expect(boardPlatformId('arduino:avr:nano:cpu=atmega328old')).toBe('arduino:avr');
    expect(boardPlatformId('esp32:esp32:esp32')).toBe('esp32:esp32');
    expect(boardPlatformId('arduino')).toBeNull();
    expect(boardPlatformId('arduino:')).toBeNull();
    expect(boardPlatformId('')).toBeNull();
  });

  it('boardPackageIndexUrl is set for ESP32 only, undefined for arduino:* and unknown boards', () => {
    expect(boardPackageIndexUrl('esp32:esp32:esp32')).toBe(ESP32_PACKAGE_INDEX_URL);
    expect(boardPackageIndexUrl('arduino:avr:uno')).toBeUndefined();
    expect(boardPackageIndexUrl('x:y:z')).toBeUndefined();
  });
});
