import type { IContextMenuItem } from '@falang/scheme';
import { describe, expect, it, vi } from 'vitest';
import { flattenInsertableMenuItems } from './ant-item-picker-modal.module.js';
import { AntItemPickerModalService } from './ant-item-picker-modal.service.js';
import { filterItemPickerItems } from './item-picker-modal.cmp.js';

describe('flattenInsertableMenuItems', () => {
  it('flattens nested insertion entries, keeps their group path and ignores other commands', () => {
    const selectAction = vi.fn();
    const selectIf = vi.fn();
    const items: IContextMenuItem[] = [
      { type: 'button', text: 'Paste', onClick: vi.fn() },
      {
        type: 'group',
        text: 'Statements',
        children: [
          { type: 'button', text: 'Action', nodeName: 'action', onClick: selectAction },
          {
            type: 'group',
            text: 'Conditions',
            children: [{ type: 'button', text: 'If', nodeName: 'if', onClick: selectIf }],
          },
        ],
      },
    ];

    const result = flattenInsertableMenuItems(items);
    expect(result.map(({ label, path }) => ({ label, path }))).toEqual([
      { label: 'Action', path: ['Statements'] },
      { label: 'If', path: ['Statements', 'Conditions'] },
    ]);
    expect(result[1].searchAliases).toEqual(['if']);
    result[1].onSelect();
    expect(selectIf).toHaveBeenCalledOnce();
    expect(selectAction).not.toHaveBeenCalled();
  });
});

describe('filterItemPickerItems', () => {
  const items = [
    { key: 'if', label: 'Если', searchAliases: ['if'], onSelect: vi.fn() },
    {
      key: 'telegram-send-message',
      label: 'Отправить сообщение',
      path: ['Интеграции', 'Telegram'],
      searchAliases: ['telegram-send-message'],
      onSelect: vi.fn(),
    },
  ];

  it('finds a localized node label by its technical alias', () => {
    expect(filterItemPickerItems(items, 'if').map((item) => item.key)).toEqual(['if']);
  });

  it('finds an integration action by its technical alias', () => {
    expect(filterItemPickerItems(items, 'TELEGRAM-SEND').map((item) => item.key)).toEqual(['telegram-send-message']);
  });
});

describe('AntItemPickerModalService', () => {
  it('opens with items and clears them when closed', () => {
    const service = new AntItemPickerModalService();
    const items = [{ key: 'action', label: 'Action', onSelect: vi.fn() }];

    service.show(items);
    expect(service.opened).toBe(true);
    expect(service.items).toEqual(items);

    service.hide();
    expect(service.opened).toBe(false);
    expect(service.items).toEqual([]);
  });
});
