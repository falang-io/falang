import { useEffect, useRef } from 'react';
import { Input, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { observer } from 'mobx-react-lite';
import type { NewVariableStore } from './new-variable.store.js';

export interface INewVariableEditingComponentProps {
  store: NewVariableStore;
  /** Whether this instance should grab DOM focus on mount. Default `true`. */
  autoFocus?: boolean;
  /**
   * `'compact'` fits the 15px `.ts-table` cell (borderless, theme-agnostic — matches its `ts-input`
   * siblings). `'default'` is a full-size, bordered antd `Input` for spacious layouts like a sidebar
   * `Form.Item`. Default `'compact'`.
   */
  variant?: 'compact' | 'default';
}

export const NewVariableEditingComponent: React.FC<INewVariableEditingComponentProps> = observer(
  ({ store, autoFocus = true, variant = 'compact' }) => {
    const inputRef = useRef<InputRef>(null);
    const isCompact = variant === 'compact';

    useEffect(() => {
      if (autoFocus) {
        inputRef.current?.focus();
      }
    }, [autoFocus]);

    const input = (
      <Input
        ref={inputRef}
        className={isCompact ? 'ts-input' : ''}
        variant={isCompact ? 'borderless' : 'outlined'}
        status={store.hasErrors ? 'error' : ''}
        value={store.value}
        onChange={(event) => store.setValue(event.currentTarget.value)}
      />
    );

    if (!store.error) return input;

    return (
      <Tooltip title={store.error} open placement="bottom">
        {input}
      </Tooltip>
    );
  },
);
