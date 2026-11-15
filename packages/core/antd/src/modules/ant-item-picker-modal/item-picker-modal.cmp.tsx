import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, List, Modal, theme, Typography } from 'antd';

export interface IItemPickerModalItem {
  readonly key: string;
  readonly label: string;
  readonly path?: readonly string[];
  readonly searchAliases?: readonly string[];
  readonly onSelect: () => void;
}

export interface IItemPickerModalProps {
  readonly open: boolean;
  readonly title: React.ReactNode;
  readonly items: readonly IItemPickerModalItem[];
  readonly searchPlaceholder: string;
  readonly emptyText: string;
  readonly onClose: () => void;
}

export const filterItemPickerItems = (items: readonly IItemPickerModalItem[], query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) =>
    [item.label, ...(item.path ?? []), ...(item.searchAliases ?? [])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
};

export const ItemPickerModal: React.FC<IItemPickerModalProps> = ({
  open,
  title,
  items,
  searchPlaceholder,
  emptyText,
  onClose,
}) => {
  const { token } = theme.useToken();
  const listId = useId();
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const filteredItems = useMemo(() => filterItemPickerItems(items, query), [items, query]);
  const activeIndex = filteredItems.length === 0 ? -1 : Math.min(selectedIndex, filteredItems.length - 1);
  const activeItem = activeIndex >= 0 ? filteredItems[activeIndex] : null;
  const optionId = (key: string) => `${listId}-option-${key}`;

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems]);

  useEffect(() => {
    selectedOptionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, filteredItems]);

  const selectItem = (item: IItemPickerModalItem) => {
    onClose();
    item.onSelect();
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
      wrapProps={{ onWheel: (event: React.WheelEvent<HTMLDivElement>) => event.stopPropagation() }}
    >
      <Input
        autoFocus
        allowClear
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        {...(activeItem ? { 'aria-activedescendant': optionId(activeItem.key) } : {})}
        data-testid="item-picker-search"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (filteredItems.length === 0) return;
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setSelectedIndex((currentIndex) => {
              const normalizedIndex = Math.min(currentIndex, filteredItems.length - 1);
              return (normalizedIndex + direction + filteredItems.length) % filteredItems.length;
            });
            return;
          }
          if (event.key === 'Enter' && activeItem) {
            event.preventDefault();
            event.stopPropagation();
            selectItem(activeItem);
          }
        }}
      />
      <div id={listId} role="listbox">
        <List
          style={{ maxHeight: 400, overflowY: 'auto', marginTop: 12 }}
          dataSource={[...filteredItems]}
          rowKey="key"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }}
          renderItem={(item, index) => {
            const selected = index === activeIndex;
            return (
              <List.Item style={{ padding: 0, border: 0 }}>
                <Button
                  ref={selected ? selectedOptionRef : null}
                  id={optionId(item.key)}
                  type="text"
                  role="option"
                  aria-selected={selected}
                  block
                  data-testid="item-picker-option"
                  data-item-key={item.key}
                  style={{
                    height: 'auto',
                    minHeight: 44,
                    padding: '8px 12px',
                    textAlign: 'left',
                    ...(selected ? { backgroundColor: token.colorFillSecondary } : {}),
                  }}
                  onClick={() => selectItem(item)}
                >
                  <div style={{ width: '100%' }}>
                    <Typography.Text>{item.label}</Typography.Text>
                    {item.path && item.path.length > 0 && (
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {item.path.join(' / ')}
                        </Typography.Text>
                      </div>
                    )}
                  </div>
                </Button>
              </List.Item>
            );
          }}
        />
      </div>
    </Modal>
  );
};
