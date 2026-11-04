/* oxlint-disable no-undefined, unicorn/number-literal-case, unicorn/numeric-separators-style */
import { deflateRawSync, gzipSync } from 'node:zlib';

const BLOCK = 512;

const header = (name: string, size: number, typeFlag: string, extra?: { prefix?: string }): Buffer => {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, 'utf8');
  block.write('0000755\0', 100, 'ascii');
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  block.write(typeFlag, 156, 'ascii');
  block.write('ustar\0', 257, 'ascii');
  if (extra?.prefix) block.write(extra.prefix, 345, 155, 'utf8');
  return block;
};

const padded = (data: Buffer): Buffer => Buffer.concat([data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK)]);

export interface ITarFixtureEntry {
  readonly name: string;
  readonly data: Buffer;
  readonly typeFlag?: string;
  readonly prefix?: string;
}

/** A hand-built `.tar.gz`. */
export const buildTarGz = (entries: readonly ITarFixtureEntry[]): Buffer =>
  gzipSync(
    Buffer.concat([
      ...entries.flatMap((entry) => [
        header(
          entry.name,
          entry.data.length,
          entry.typeFlag ?? '0',
          entry.prefix ? { prefix: entry.prefix } : undefined,
        ),
        padded(entry.data),
      ]),
      Buffer.alloc(BLOCK * 2),
    ]),
  );

export const paxRecord = (key: string, value: string): Buffer => {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return Buffer.from(`${length}${body}`);
};

export interface IZipFixtureEntry {
  readonly name: string;
  readonly data: Buffer;
  readonly deflate?: boolean;
}

/** A hand-built `.zip` (stored or deflated entries, no data descriptors). */
export const buildZip = (entries: readonly IZipFixtureEntry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const body = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
};
