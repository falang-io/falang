/* oxlint-disable unicorn/number-literal-case, unicorn/numeric-separators-style */
import { inflateRawSync } from 'node:zlib';
import { isSafeEntryName, MAX_EXTRACTED_BYTES, normalizeEntryName } from './archive-entry-name.js';

const EOCD_SIGNATURE = 0x0605_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const LOCAL_SIGNATURE = 0x0403_4b50;

const findEndOfCentralDirectory = (zip: Buffer): number => {
  const lowest = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= lowest; offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('Not a zip archive.');
};

/**
 * Takes one file out of a `.zip` held in memory (stored or deflated). Only an exact root-level `name`
 * matches; an unsafe entry path rejects the whole archive; ZIP64 and encrypted entries are refused.
 */
export const extractZipEntry = (zip: Buffer, name: string): Buffer => {
  const eocd = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || centralOffset === 0xffff_ffff) throw new Error('ZIP64 archives are not supported.');
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new Error('Corrupt zip directory.');
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const entryName = normalizeEntryName(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!isSafeEntryName(entryName)) throw new Error(`Unsafe path in archive: "${entryName}"`);
    if (entryName !== name) continue;
    if (flags % 2 === 1) throw new Error('Encrypted zip entries are not supported.');
    if (compressedSize === 0xffff_ffff || size === 0xffff_ffff || localOffset === 0xffff_ffff) {
      throw new Error('ZIP64 archives are not supported.');
    }
    if (size > MAX_EXTRACTED_BYTES) throw new Error('Archive entry is too large.');
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error('Corrupt zip entry.');
    }
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (data.length !== compressedSize) throw new Error('Truncated zip entry.');
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_EXTRACTED_BYTES });
    throw new Error(`Unsupported zip compression method ${method}.`);
  }
  throw new Error(`"${name}" not found in the archive.`);
};
