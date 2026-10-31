/**
 * A minimal, binary-safe multipart/form-data reader (no `multer`/parsing dependency, per this repo's
 * own "read the raw body, extract with a regex" convention for mocks — see `openai-mock.ts`'s
 * `MULTIPART_FILENAME`). `latin1` maps each byte to one code point 1:1, so the body round-trips
 * through a JS string without corrupting binary content, unlike the default `utf8`.
 */
export interface IParsedMultipartFile {
  readonly fieldName: string;
  readonly filename: string;
  readonly bytes: Buffer;
}

export interface IParsedMultipart {
  readonly fields: Record<string, string>;
  readonly file?: IParsedMultipartFile;
}

interface IParsedMultipartPart {
  readonly name: string;
  readonly value: string;
  /** `null` for a plain field, the (possibly empty) filename for the uploaded file's own part. */
  readonly filename: string | null;
}

/** One part of a multipart body, past its `--boundary` delimiter — either a plain field or (when `filename` is present) the uploaded file. `null` when the part has no parseable header/name (malformed input). */
const parseMultipartPart = (rawPart: string): IParsedMultipartPart | null => {
  const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
  const headerEnd = part.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;
  const header = part.slice(0, headerEnd);
  const name = /name="([^"]+)"/.exec(header)?.[1];
  if (!name) return null;
  const filenameMatch = /filename="([^"]*)"/.exec(header);
  return { filename: filenameMatch ? filenameMatch[1] : null, name, value: part.slice(headerEnd + 4) };
};

export const parseMultipart = (body: Buffer, contentType: string): IParsedMultipart => {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  const fields: Record<string, string> = {};
  if (!boundary) return { fields };

  const text = body.toString('latin1');
  const rawParts = text.split(`--${boundary}`).slice(1, -1);
  const parsedParts: IParsedMultipartPart[] = [];
  for (const rawPart of rawParts) {
    const parsed = parseMultipartPart(rawPart);
    if (parsed) parsedParts.push(parsed);
  }
  const filePart = parsedParts.find((part) => part.filename !== null);
  for (const part of parsedParts) if (part.filename === null) fields[part.name] = part.value;
  if (!filePart) return { fields };
  const file: IParsedMultipartFile = {
    bytes: Buffer.from(filePart.value, 'latin1'),
    fieldName: filePart.name,
    filename: filePart.filename ?? '',
  };
  return { fields, file };
};
