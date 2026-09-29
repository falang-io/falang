import { useCallback, useEffect, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor';
import { observer } from 'mobx-react-lite';
import { CELL_SIZE, TOKEN_SCHEME, useService } from '@falang/scheme';
import { getMonaco, getOverflowWidgetsDomNode, useCodeTheme } from '@falang/typescript-scheme';
import type { RawCodeModelStore } from './raw-code-model.store.js';

export interface IRawCodeEditorComponentProps {
  store: RawCodeModelStore;
  /** Whether this instance should grab DOM focus on mount. Default `true`. */
  autoFocus?: boolean;
  /** Floor for the auto-grow height, in px. Default `CELL_SIZE`. */
  minHeight?: number;
}

const monacoOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  // Suggest/hover widgets must escape the block's own `overflow: hidden` container, same gotcha
  // `@falang/typescript-scheme`'s `CodeModelEditingComponent` documents.
  fixedOverflowWidgets: true,
  fontSize: 12,
  wordWrap: 'bounded',
  wordWrapColumn: 200,
  automaticLayout: true,
  glyphMargin: false,
  folding: false,
  lineNumbers: 'off',
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 0,
  foldingHighlight: false,
  fontFamily: '"Courier New", monospace',
  scrollbar: {
    vertical: 'hidden',
    horizontal: 'hidden',
  },
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
};

const monacoThemeName = (theme: ReturnType<typeof useCodeTheme>): string => (theme === 'dark' ? 'vs-dark' : 'vs');

/** No-validation counterpart of `@falang/typescript-scheme`'s `CodeModelEditingComponent` — same
 * auto-grow/overflow-widget/pan-zoom mechanics, minus the `hasErrors` outline (this domain never
 * has diagnostics) and the sidebar `variant` (the `code` domain has no sidebar editors). */
export const RawCodeEditorComponent: React.FC<IRawCodeEditorComponentProps> = observer(
  ({ store, autoFocus = true, minHeight = CELL_SIZE }) => {
    const model = store.model;
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
    const [height, setHeight] = useState(minHeight);
    const theme = useCodeTheme();
    const { viewPosition } = useService(TOKEN_SCHEME);
    const { scale, x, y } = viewPosition;

    const updateHeight = useCallback(() => {
      if (!editorRef.current) return;
      const editorInstance = editorRef.current;
      const domNode = editorInstance.getDomNode();
      if (!domNode) return;
      const viewLines = domNode.querySelector('.view-lines');
      if (!viewLines) return;
      const scrollHeight = viewLines.scrollHeight;
      const viewLinesCount = viewLines.querySelectorAll('.view-line').length;
      const lineHeight = editorInstance.getOption(store.monaco.editor.EditorOption.lineHeight);
      const linesHeight = viewLinesCount * lineHeight;
      const currentHeight = domNode.clientHeight;
      const resultHeight = linesHeight < currentHeight ? linesHeight : scrollHeight;
      setHeight(Math.max(minHeight, resultHeight));
    }, [minHeight]);

    useEffect(() => {
      if (!containerRef.current) return;
      editorRef.current = getMonaco().editor.create(containerRef.current, {
        model,
        ...monacoOptions,
        theme: monacoThemeName(theme),
        overflowWidgetsDomNode: getOverflowWidgetsDomNode(monacoThemeName(theme)),
      });
      store.setEditor(editorRef.current);
      setTimeout(updateHeight, 0);
      const disposable1 = editorRef.current.onDidChangeModelContent(() => {
        store.updateValue();
        setTimeout(updateHeight, 0);
      });
      const disposable2 = editorRef.current.onDidChangeModel(() => {
        setTimeout(updateHeight, 0);
      });
      if (autoFocus) {
        setTimeout(() => editorRef.current?.focus(), 0);
      }
      return () => {
        disposable1.dispose();
        disposable2.dispose();
        store.setEditor(null);
        editorRef.current?.dispose();
        editorRef.current = null;
      };
    }, [store, updateHeight, autoFocus]);

    useEffect(() => {
      getMonaco().editor.setTheme(monacoThemeName(theme));
      getOverflowWidgetsDomNode(monacoThemeName(theme));
    }, [theme]);

    useEffect(() => {
      // Panning/zooming the scheme canvas moves the editor's bounding rect without firing any DOM
      // resize/scroll event monaco listens to — see `CodeModelEditingComponent`'s identical comment.
      editorRef.current?.layout();
    }, [scale, x, y]);

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: 'calc(100% + 20px)',
          height,
        }}
      />
    );
  },
);
