/** `photo.jpg` + `resized` + `webp` → `photo.resized.webp` (ADR 0041 (private) §1's own example). */
export const deriveOutputName = (inputName: string, suffix: string, ext: string): string => {
  const withoutExt = inputName.replace(/\.[^./]+$/, '');
  const base = withoutExt.length > 0 ? withoutExt : inputName;
  return `${base}.${suffix}.${ext}`;
};
