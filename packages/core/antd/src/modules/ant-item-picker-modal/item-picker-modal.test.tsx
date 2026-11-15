// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemPickerModal, type IItemPickerModalItem } from './item-picker-modal.cmp.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }),
);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  containers.splice(0).forEach((container) => container.remove());
  document.body.innerHTML = '';
});

const setup = () => {
  const onClose = vi.fn();
  const items: IItemPickerModalItem[] = [
    { key: 'action', label: 'Action', onSelect: vi.fn() },
    { key: 'log', label: 'Log', onSelect: vi.fn() },
    { key: 'if', label: 'Если', searchAliases: ['if'], onSelect: vi.fn() },
  ];
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      createElement(ItemPickerModal, {
        open: true,
        title: 'Insert node',
        items,
        searchPlaceholder: 'Search',
        emptyText: 'Empty',
        onClose,
      }),
    );
  });
  const search = document.body.querySelector<HTMLInputElement>('[data-testid="item-picker-search"]');
  if (!search) throw new Error('Search input not found');
  return { items, onClose, search };
};

const options = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid="item-picker-option"]')];

const pressKey = (input: HTMLInputElement, key: string) => {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

const fillSearch = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Input value setter not found');
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('ItemPickerModal keyboard navigation', () => {
  it('moves the selection with arrows and inserts the selected item on Enter', () => {
    const { items, onClose, search } = setup();
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    pressKey(search, 'ArrowDown');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    pressKey(search, 'ArrowDown');
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    pressKey(search, 'ArrowUp');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');

    pressKey(search, 'Enter');
    expect(onClose).toHaveBeenCalledOnce();
    expect(items[1].onSelect).toHaveBeenCalledOnce();
    expect(items[0].onSelect).not.toHaveBeenCalled();
    expect(items[2].onSelect).not.toHaveBeenCalled();
  });

  it('selects the first filtered item and inserts it on Enter', () => {
    const { items, onClose, search } = setup();
    pressKey(search, 'ArrowDown');

    fillSearch(search, 'if');
    expect(options()).toHaveLength(1);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    pressKey(search, 'Enter');
    expect(onClose).toHaveBeenCalledOnce();
    expect(items[2].onSelect).toHaveBeenCalledOnce();
    expect(items[0].onSelect).not.toHaveBeenCalled();
    expect(items[1].onSelect).not.toHaveBeenCalled();
  });
});
