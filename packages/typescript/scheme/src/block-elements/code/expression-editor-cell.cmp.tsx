import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import type { CodeModelStore } from './code-model.store.js';
import { CodeModelEditingComponent } from './code-model.editing.cmp.js';

export interface IExpressionEditorCellProps {
  store: CodeModelStore;
  hiddenPrefix: string;
  /** e.g. the closing backtick of a template literal the value is wrapped in — see `CodeModelStore.hiddenSuffix`. */
  hiddenSuffix?: string;
  /** Whether this field should grab DOM focus on mount. Default `true`. */
  autoFocus?: boolean;
  /** Floor for the auto-grow height, in px — see `CodeModelEditingComponent`. Default `CELL_SIZE`. */
  minHeight?: number;
  /** `'compact'` (default) vs. `'default'` antd-`Input`-like framed look — see `CodeModelEditingComponent`. */
  variant?: 'compact' | 'default';
}

/** A single monaco-backed expression field, e.g. one table cell of a block editor. */
export const ExpressionEditorCellComponent: React.FC<IExpressionEditorCellProps> = observer(
  ({ store, hiddenPrefix, hiddenSuffix = '', autoFocus, minHeight, variant }) => {
    useEffect(() => {
      store.setHiddenPrefix(hiddenPrefix);
    }, [store, hiddenPrefix]);

    useEffect(() => {
      store.setHiddenSuffix(hiddenSuffix);
    }, [store, hiddenSuffix]);

    return <CodeModelEditingComponent store={store} autoFocus={autoFocus} minHeight={minHeight} variant={variant} />;
  },
);
