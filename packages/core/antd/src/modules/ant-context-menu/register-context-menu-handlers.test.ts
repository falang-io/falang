import type { IContextMenuItem, TFunction } from '@falang/scheme';
import { describe, expect, it, vi } from 'vitest';
import { translateContextMenuItems } from './register-context-menu-handlers.js';

const t = ((key: string) => (key === 'icon:break' ? 'Break' : key)) as TFunction;

describe('translateContextMenuItems', () => {
  it("resolves a button item's raw `namespace:key` text (e.g. `addForIcons`'s `icon:${item}`)", () => {
    const items: IContextMenuItem[] = [{ type: 'button', text: 'icon:break', onClick: vi.fn() }];

    expect(translateContextMenuItems(items, t)).toEqual([
      { type: 'button', text: 'Break', onClick: expect.any(Function) },
    ]);
  });

  it('recurses into group children', () => {
    const items: IContextMenuItem[] = [
      {
        type: 'group',
        text: 'icon:break',
        children: [{ type: 'button', text: 'icon:break', onClick: vi.fn() }],
      },
    ];

    const [result] = translateContextMenuItems(items, t);
    expect(result.text).toBe('Break');
    expect(result.type === 'group' && result.children[0].text).toBe('Break');
  });

  it("passes a `raw` button's text through untouched, even when it looks like `namespace:key`", () => {
    const items: IContextMenuItem[] = [{ type: 'button', text: 'icon:break', raw: true, onClick: vi.fn() }];

    expect(translateContextMenuItems(items, t)[0].text).toBe('icon:break');
  });

  it("leaves already-resolved text unchanged (e.g. `buildOutsMenu`'s pre-translated strings)", () => {
    const items: IContextMenuItem[] = [{ type: 'button', text: 'Break 2', onClick: vi.fn() }];

    expect(translateContextMenuItems(items, t)[0].text).toBe('Break 2');
  });
});
