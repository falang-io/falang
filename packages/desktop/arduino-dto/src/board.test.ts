import { describe, expect, it } from 'vitest';
import { ARDUINO_BOARDS, DEFAULT_BOARD_FQBN, boardLabel } from './board.js';

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
});
