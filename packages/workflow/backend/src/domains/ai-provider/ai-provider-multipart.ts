/**
 * Reads plain text fields (`model`, `stream`) out of a `multipart/form-data` body without parsing or re-encoding it
 * (ADR 0081 (private): the relay forwards the original bytes and boundary to the upstream). A boundary scan over the
 * `Buffer`: only each part's header block is decoded, a file part's bytes are never copied.
 */

const HEADER_END = Buffer.from('\r\n\r\n');
const DASH = '-'.codePointAt(0);

/** The `boundary` parameter of a `multipart/form-data` content type, or `null` for any other type. */
export const multipartBoundary = (contentType: string | undefined): string | null => {
  if (!contentType) return null;
  const [type, ...params] = contentType.split(';');
  if (type?.trim().toLowerCase() !== 'multipart/form-data') return null;
  for (const param of params) {
    const eq = param.indexOf('=');
    if (eq === -1 || param.slice(0, eq).trim().toLowerCase() !== 'boundary') continue;
    const raw = param.slice(eq + 1).trim();
    const value = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
    return value.length > 0 && value.length <= 200 ? value : null;
  }
  return null;
};

const DISPOSITION_NAME = /^content-disposition:\s*form-data\s*;(.*)$/im;
const PARAM_NAME = /(?:^|;)\s*name="([^"]*)"/i;
const PARAM_FILENAME = /(?:^|;)\s*filename\*?=/i;

/**
 * The values of the plain (non-file) fields named in `names`; the first occurrence wins. Fields not present are
 * absent from the result. A malformed body simply yields fewer fields — the upstream judges the body itself.
 */
export const readMultipartTextFields = (
  body: Buffer,
  boundary: string,
  names: readonly string[],
): Record<string, string> => {
  const wanted = new Set(names);
  const fields: Record<string, string> = {};
  // Every delimiter after the first is preceded by CRLF; the first may start the body.
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  let start = body.indexOf(delimiter);
  if (start === -1) return fields;
  start += delimiter.length;
  while (start < body.length && wanted.size > 0) {
    // `--` right after a delimiter closes the body.
    if (body[start] === DASH && body[start + 1] === DASH) break;
    const headerEnd = body.indexOf(HEADER_END, start);
    if (headerEnd === -1) break;
    const end = body.indexOf(nextDelimiter, headerEnd + HEADER_END.length);
    if (end === -1) break;
    const header = body.subarray(start, headerEnd).toString('latin1');
    const disposition = DISPOSITION_NAME.exec(header)?.[1] ?? '';
    const name = PARAM_NAME.exec(disposition)?.[1];
    if (typeof name === 'string' && wanted.has(name) && !PARAM_FILENAME.test(disposition)) {
      fields[name] = body.subarray(headerEnd + HEADER_END.length, end).toString('utf8');
      wanted.delete(name);
    }
    start = end + nextDelimiter.length;
  }
  return fields;
};
