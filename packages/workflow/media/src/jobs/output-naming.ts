const MAX_NAME_LENGTH = 100;

/** Reduces an untrusted file name to a safe one: basename only (both `/` and `\` separators), only
 * `[A-Za-z0-9._-]`, no leading dots, bounded length, never empty. */
export const sanitizeFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replaceAll(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : 'file';
};

/** Extension (with the dot) of an untrusted file name, safe to splice into a temp path; `.bin` when none. */
export const safeExtension = (name: string): string => {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(sanitizeFileName(name));
  return match ? `.${match[1]}` : '.bin';
};

/** `photo.jpg` + `resized` + `webp` → `photo.resized.webp` (ADR 0041 (private) §1's own example);
 * the input name is sanitized first, since it ends up in a path and in the uploaded file's name. */
export const deriveOutputName = (inputName: string, suffix: string, ext: string): string => {
  const safe = sanitizeFileName(inputName);
  const withoutExt = safe.replace(/\.[^./]+$/, '');
  const base = withoutExt.length > 0 ? withoutExt : safe;
  return `${base}.${suffix}.${ext}`;
};
