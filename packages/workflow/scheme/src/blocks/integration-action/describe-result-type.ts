/**
 * Human-readable summary of a `result-type` field's stored value for the read-only block: an empty/invalid
 * value is the plain-text default (`{ type: 'string' }` is never stored for a fresh node), a struct shows
 * its project name (falling back to the id, or `…` while none is picked yet).
 */
export const describeResultType = (
  raw: string | undefined,
  t: (key: string) => string,
  getStructName: (id: string) => string | null | undefined = () => null,
): string => {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && parsed.type === 'struct') {
        const id = 'id' in parsed && typeof parsed.id === 'string' ? parsed.id : '';
        if (!id) return `${t('integration-editor:result-structured-output')}: …`;
        return `${t('integration-editor:result-structured-output')}: ${getStructName(id) || id}`;
      }
    } catch {
      // fall through to the text default
    }
  }
  return t('integration-editor:result-text');
};
