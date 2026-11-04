import { gunzipSync } from 'node:zlib';
import { isSafeEntryName, MAX_EXTRACTED_BYTES, normalizeEntryName } from './archive-entry-name.js';

const BLOCK = 512;

const readString = (buffer: Buffer, start: number, length: number): string => {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
};

const readOctal = (buffer: Buffer, start: number, length: number): number => {
  const text = readString(buffer, start, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error('Malformed tar header.');
  return Number.parseInt(text, 8);
};

/** PAX extended header records: `<len> <key>=<value>\n`. */
const parsePaxPath = (data: Buffer): string | null => {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = data
      .subarray(space + 1, offset + length)
      .toString('utf8')
      .replace(/\n$/, '');
    if (record.startsWith('path=')) return record.slice('path='.length);
    offset += length;
  }
  return null;
};

/**
 * Takes one file out of a `.tar.gz` held in memory. Only an exact root-level `name` matches; an entry
 * with an absolute or `..` path rejects the whole archive. Handles ustar prefixes, PAX and GNU long names.
 */
export const extractTarGzEntry = (archive: Buffer, name: string): Buffer => {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_EXTRACTED_BYTES * 2 });
  let offset = 0;
  let pendingName: string | null = null;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = readOctal(header, 124, 12);
    const typeFlag = String.fromCodePoint(header[156] ?? 0);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('Truncated tar archive.');
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (typeFlag === 'x') {
      pendingName = parsePaxPath(tar.subarray(dataStart, dataEnd)) ?? pendingName;
    } else if (typeFlag === 'L') {
      pendingName = readString(tar.subarray(dataStart, dataEnd), 0, size);
    } else if (typeFlag !== 'g') {
      const prefix = readString(header, 345, 155);
      const isUstar = readString(header, 257, 5) === 'ustar';
      const baseName = readString(header, 0, 100);
      const entryName = normalizeEntryName(
        pendingName ?? (isUstar && prefix !== '' ? `${prefix}/${baseName}` : baseName),
      );
      pendingName = null;
      if (!isSafeEntryName(entryName)) throw new Error(`Unsafe path in archive: "${entryName}"`);
      if ((typeFlag === '0' || typeFlag === '\0') && entryName === name) {
        if (size > MAX_EXTRACTED_BYTES) throw new Error('Archive entry is too large.');
        return Buffer.from(tar.subarray(dataStart, dataEnd));
      }
    }
    offset = next;
  }
  throw new Error(`"${name}" not found in the archive.`);
};
