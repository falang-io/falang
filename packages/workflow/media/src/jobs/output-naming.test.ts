import { describe, expect, it } from 'vitest';
import { deriveOutputName, safeExtension, sanitizeFileName } from './output-naming.js';

describe('sanitizeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['a/b', 'b'],
    [String.raw`a\b.png`, 'b.png'],
    ['..', 'file'],
    ['.hidden', 'hidden'],
    ['', 'file'],
    ['фото.png', '____.png'],
    ['a b;rm -rf.png', 'a_b_rm_-rf.png'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds the length', () => {
    expect(sanitizeFileName(`${'a'.repeat(300)}.png`).length).toBeLessThanOrEqual(100);
  });
});

describe('safeExtension / deriveOutputName', () => {
  it('only yields a plain alnum extension', () => {
    expect(safeExtension('x.p/../y.MP4')).toBe('.MP4');
    expect(safeExtension('noext')).toBe('.bin');
    expect(safeExtension('a.b$c')).toBe('.bin');
  });

  it('derives a traversal-free output name', () => {
    expect(deriveOutputName('photo.jpg', 'resized', 'webp')).toBe('photo.resized.webp');
    expect(deriveOutputName('../../etc/passwd', 'resized', 'webp')).toBe('passwd.resized.webp');
    expect(deriveOutputName('/'.repeat(5), 'r', 'png')).toBe('file.r.png');
  });
});
