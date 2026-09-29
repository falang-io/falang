/**
 * `compileProject` (see `compile-project.ts`/`node-emitters.ts`) always wraps every document's
 * compiled function in `// doc-start:<name>:<id>` / `// doc-end:<name>:<id>` marker comments, and
 * every statement node inside it in `// icon-start:<name>:<id>` / `// icon-end:...` — this module
 * parses those markers back out of the generated text, so a line number (e.g. from a TypeScript
 * diagnostic) can always be resolved back to the document/node that produced it, no matter how
 * deeply nested.
 */

/** One marker's span within the source, 0-indexed and inclusive of both its own start/end marker lines. */
export interface IMarkerRange {
  readonly kind: 'doc' | 'icon';
  readonly name: string;
  readonly id: string;
  readonly startLine: number;
  readonly endLine: number;
}

// Leading whitespace: nested statements are indented, markers are indented right along with them.
// `(.*)`/greedy captures the name up to the *last* colon, so a document name containing a colon
// still parses correctly — only the id (a uuid/nanoid) is assumed colon-free.
const MARKER_PATTERN = /^\s*\/\/\s*(icon|doc)-(start|end):(.*):([^:]+)$/;

/** Parses every marker pair out of instrumented source text into a flat list of ranges (unordered by nesting — see `resolveMarkerLocation` for querying "innermost enclosing"). Malformed/unbalanced markers (a stray end with no matching start) are silently ignored rather than thrown, since this is best-effort diagnostic attribution, not something that should ever fail a build. */
export const parseCompiledMarkers = (source: string): readonly IMarkerRange[] => {
  const stack: { kind: 'doc' | 'icon'; name: string; id: string; startLine: number }[] = [];
  const ranges: IMarkerRange[] = [];

  source.split('\n').forEach((lineText, index) => {
    const match = MARKER_PATTERN.exec(lineText);
    if (!match) return;
    const [, kind, startOrEnd, name, id] = match;
    if (startOrEnd === 'start') {
      stack.push({ kind: kind as 'doc' | 'icon', name, id, startLine: index });
      return;
    }
    const open = stack.pop();
    if (!open) return;
    ranges.push({ kind: open.kind, name: open.name, id: open.id, startLine: open.startLine, endLine: index });
  });

  return ranges;
};

export interface IMarkerLocation {
  readonly documentId?: string;
  readonly documentName?: string;
  readonly nodeId?: string;
}

/** Finds the innermost enclosing `doc`/`icon` range for a given 0-indexed line — "innermost" meaning the smallest span among every range that contains it (ranges nest strictly, by construction). Returns an empty object for a line outside every marker (e.g. the preamble, or a marker line itself). */
export const resolveMarkerLocation = (markers: readonly IMarkerRange[], line: number): IMarkerLocation => {
  const containing = markers.filter((marker) => line >= marker.startLine && line <= marker.endLine);
  const smallestOf = (kind: 'doc' | 'icon'): IMarkerRange | undefined =>
    containing
      .filter((marker) => marker.kind === kind)
      .toSorted((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine))[0];

  const doc = smallestOf('doc');
  const icon = smallestOf('icon');
  return {
    ...(doc ? { documentId: doc.id, documentName: doc.name } : {}),
    ...(icon ? { nodeId: icon.id } : {}),
  };
};
