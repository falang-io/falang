import { useCallback, useEffect, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor';
import { observer } from 'mobx-react-lite';
import { theme as antdTheme } from 'antd';
import { CELL_SIZE, TOKEN_SCHEME, useService } from '@falang/scheme';
import { getMonaco, getOverflowWidgetsDomNode } from '../../monaco/get-monaco.js';
import { useCodeTheme } from '../../monaco/use-code-theme.js';
import type { CodeModelStore } from './code-model.store.js';
import { focusNeighbourField } from './tab-navigation.js';
//import type { CodeModelStore } from "./CodeModel.store";

export interface ICodeModelEditingComponentProps {
  store: CodeModelStore;
  /** Whether this instance should grab DOM focus on mount. Default `true`. */
  autoFocus?: boolean;
  /** Floor for the auto-grow height, in px. Default `CELL_SIZE` (an inline table-cell field); a sidebar field passes a taller value. */
  minHeight?: number;
  /**
   * `'compact'` fits the borderless `.ts-table` cell (matches its `ts-input`/`ts-select` siblings).
   * `'default'` frames the editor in an antd-`Input`-like border/padding, themed via `theme.useToken()`,
   * for spacious layouts like a sidebar `Form.Item`. Default `'compact'`.
   */
  variant?: 'compact' | 'default';
  /**
   * Tab / Shift+Tab move focus to the next / previous field of the block instead of inserting a tab character
   * (at the first/last field the key does nothing). Default: on for the inline `'compact'` variant only.
   */
  tabNavigation?: boolean;
}

const monacoOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  // Suggest/hover widgets must escape the `overflow: hidden` on `.ts-table--fixed td:last-child`
  // (see typescript-block-container.tsx), otherwise autocomplete never becomes visible.
  fixedOverflowWidgets: true,
  fontSize: 12,
  //wordWrap: 'on',
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
  language: 'ru',
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
};

const monacoThemeName = (theme: ReturnType<typeof useCodeTheme>): string => (theme === 'dark' ? 'vs-dark' : 'vs');

export const CodeModelEditingComponent: React.FC<ICodeModelEditingComponentProps> = observer(
  ({ store, autoFocus = true, minHeight = CELL_SIZE, variant = 'compact', tabNavigation }) => {
    const model = store.model;
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
    const [height, setHeight] = useState(minHeight);
    const theme = useCodeTheme();
    const { viewPosition } = useService(TOKEN_SCHEME);
    const { scale, x, y } = viewPosition;
    const { token } = antdTheme.useToken();
    const isDefault = variant === 'default';
    const tabNavigationOn = tabNavigation ?? !isDefault;

    const updateHeight = useCallback(() => {
      if (!editorRef.current) return;

      const editor = editorRef.current;
      const domNode = editor.getDomNode();

      if (!domNode) return;

      // Ищем элемент с контентом строк
      const viewLines = domNode.querySelector('.view-lines');
      if (!viewLines) return;
      const scrollHeight = viewLines.scrollHeight;
      const viewLinesCount = viewLines.querySelectorAll('.view-line').length;
      const lineHeight = editor.getOption(store.monaco.editor.EditorOption.lineHeight);

      const linesHeight = viewLinesCount * lineHeight;
      const currentHeight = domNode.clientHeight;

      let resultHeight = scrollHeight;
      if (linesHeight < currentHeight) {
        resultHeight = linesHeight;
      }
      // console.log({ scrollHeight, resultHeight, linesHeight, lineHeight, viewLinesCount, height });
      setHeight(Math.max(minHeight, resultHeight));
    }, [minHeight]);

    useEffect(() => {
      // console.log('Эффект', store);
      if (!containerRef.current) return;
      // console.log('create client', containerRef.current);
      editorRef.current = getMonaco().editor.create(containerRef.current, {
        model,
        ...monacoOptions,
        theme: monacoThemeName(theme),
        overflowWidgetsDomNode: getOverflowWidgetsDomNode(monacoThemeName(theme)),
      });
      store.setEditor(editorRef.current);
      if (tabNavigationOn) {
        const monacoApi = getMonaco();
        const editor = editorRef.current;
        // Leave Tab to Monaco while a suggestion / snippet / parameter hint is active (accepts it / next placeholder).
        const free = '!suggestWidgetVisible && !inSnippetMode && !parameterHintsVisible && !inlineSuggestionVisible';
        editor.addCommand(
          monacoApi.KeyCode.Tab,
          () => {
            const dom = editor.getDomNode();
            if (dom) focusNeighbourField(dom, 'next');
          },
          free,
        );
        editor.addCommand(
          // oxlint-disable-next-line no-bitwise
          monacoApi.KeyMod.Shift | monacoApi.KeyCode.Tab,
          () => {
            const dom = editor.getDomNode();
            if (dom) focusNeighbourField(dom, 'previous');
          },
          free,
        );
      }
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
      //monaco.languages.registerHoverProvider()
      return () => {
        disposable1.dispose();
        disposable2.dispose();
        store.setEditor(null);
        editorRef.current?.dispose();
        editorRef.current = null;
      };
    }, [store, updateHeight, autoFocus, tabNavigationOn]);

    useEffect(() => {
      getMonaco().editor.setTheme(monacoThemeName(theme));
      getOverflowWidgetsDomNode(monacoThemeName(theme));
    }, [theme]);

    useEffect(() => {
      // Monaco positions its (fixed) overflow widgets from the editor's own getBoundingClientRect,
      // recomputed on layout/render. Panning/zooming the scheme canvas moves that rect without
      // firing any DOM resize/scroll event Monaco listens to, so widgets left open while the view
      // moves must be nudged into recomputing their position by hand.
      editorRef.current?.layout();
    }, [scale, x, y]);

    return (
      <div
        ref={containerRef}
        style={
          isDefault
            ? {
                position: 'relative',
                boxSizing: 'border-box',
                width: '100%',
                height,
                padding: '4px 11px',
                border: `1px solid ${store.hasErrors ? token.colorError : token.colorBorder}`,
                borderRadius: token.borderRadius,
                background: token.colorBgContainer,
              }
            : {
                position: 'relative',
                width: 'calc(100% + 20px)',
                height,
                boxShadow: store.hasErrors ? 'inset 0 0 0 1px #ff4d4f' : 'none',
              }
        }
      />
    );
  },
);
