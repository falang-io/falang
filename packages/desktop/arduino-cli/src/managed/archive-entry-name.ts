/** Largest binary taken out of an archive (the real one is ~30 MB). */
export const MAX_EXTRACTED_BYTES = 300 * 1024 * 1024;

/** Archive paths we are willing to even look at: relative, no `..` segment, no drive/backslash tricks. */
export const isSafeEntryName = (name: string): boolean => {
  if (name === '' || name.includes('\0') || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) {
    return false;
  }
  return !name.split(/[/\\]/).includes('..');
};

/** `./arduino-cli` → `arduino-cli`. */
export const normalizeEntryName = (name: string): string => name.replace(/^(\.\/)+/, '');
