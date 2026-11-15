import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, List, Modal, Typography } from 'antd';

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
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filteredItems = useMemo(() => filterItemPickerItems(items, query), [items, query]);

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
        data-testid="item-picker-search"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <List
        style={{ maxHeight: 400, overflowY: 'auto', marginTop: 12 }}
        dataSource={[...filteredItems]}
        rowKey="key"
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }}
        renderItem={(item) => (
          <List.Item style={{ padding: 0, border: 0 }}>
            <Button
              type="text"
              block
              data-testid="item-picker-option"
              data-item-key={item.key}
              style={{ height: 'auto', minHeight: 44, padding: '8px 12px', textAlign: 'left' }}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
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
        )}
      />
    </Modal>
  );
};
