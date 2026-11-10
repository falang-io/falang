/**
 * Pure helpers keeping the user inside the visible part of a `CodeModelStore` model (the hidden prefix and suffix are
 * ordinary model lines Monaco merely doesn't draw, so the cursor, Ctrl+A and edits reach them unless clamped).
 */

export interface ITextPosition {
  lineNumber: number;
  column: number;
}

/** A selection as anchor (`selectionStart…`) and head (`position…`), the same fields as Monaco's `ISelection`. */
export interface ITextSelection {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
}

export interface IVisibleRange {
  start: ITextPosition;
  end: ITextPosition;
}

/** Whether the model text still consists of the untouched hidden prefix, some value and the untouched hidden suffix. */
export const isModelTextIntact = (text: string, prefix: string, suffix: string): boolean =>
  text.length >= prefix.length + suffix.length && text.startsWith(prefix) && text.endsWith(suffix);

/** The user's value inside an intact model text. */
export const extractValue = (text: string, prefix: string, suffix: string): string =>
  text.slice(prefix.length, text.length - suffix.length);

const compare = (a: ITextPosition, b: ITextPosition): number =>
  a.lineNumber === b.lineNumber ? a.column - b.column : a.lineNumber - b.lineNumber;

export const clampPosition = (position: ITextPosition, visible: IVisibleRange): ITextPosition => {
  if (compare(position, visible.start) < 0) return visible.start;
  if (compare(position, visible.end) > 0) return visible.end;
  return position;
};

/** The selection with both ends moved into the visible range (direction kept), or `null` when it is already inside. */
export const clampSelection = (selection: ITextSelection, visible: IVisibleRange): ITextSelection | null => {
  const anchor = clampPosition(
    { lineNumber: selection.selectionStartLineNumber, column: selection.selectionStartColumn },
    visible,
  );
  const head = clampPosition({ lineNumber: selection.positionLineNumber, column: selection.positionColumn }, visible);
  if (
    anchor.lineNumber === selection.selectionStartLineNumber &&
    anchor.column === selection.selectionStartColumn &&
    head.lineNumber === selection.positionLineNumber &&
    head.column === selection.positionColumn
  ) {
    return null;
  }
  return {
    selectionStartLineNumber: anchor.lineNumber,
    selectionStartColumn: anchor.column,
    positionLineNumber: head.lineNumber,
    positionColumn: head.column,
  };
};

const isCollapsedAt = (selection: ITextSelection, position: ITextPosition): boolean =>
  selection.selectionStartLineNumber === position.lineNumber &&
  selection.selectionStartColumn === position.column &&
  selection.positionLineNumber === position.lineNumber &&
  selection.positionColumn === position.column;

/**
 * Whether a Backspace (`'left'`) or Delete (`'right'`) would join the visible text with a hidden line: some cursor
 * sits, with nothing selected, at the very start (Backspace) or end (Delete) of the visible range.
 */
export const deletesIntoHidden = (
  direction: 'left' | 'right',
  selections: readonly ITextSelection[],
  visible: IVisibleRange,
): boolean => {
  const boundary = direction === 'left' ? visible.start : visible.end;
  return selections.some((selection) => isCollapsedAt(selection, boundary));
};
