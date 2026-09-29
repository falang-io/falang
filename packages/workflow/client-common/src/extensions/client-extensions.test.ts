import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ClientExtensionsProvider,
  findExtensionView,
  sortExtensionNavItems,
  toExtensionViewName,
  useClientExtensions,
  type IClientExtensions,
} from './client-extensions.js';
import { NavigationStore } from '../navigation-store.js';

const Probe = () => {
  const ext = useClientExtensions();
  return createElement('div', null, ext.renderPlanBadge?.({ username: 'u' } as never) ?? 'none');
};

describe('client extensions', () => {
  it('defaults to no extensions', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<div>none</div>');
    expect(sortExtensionNavItems()).toEqual([]);
    expect(findExtensionView({}, 'runs')).toBeUndefined();
    expect(findExtensionView({}, 'ext:x')).toBeUndefined();
  });

  it('sorts nav items by order, unordered last, stable', () => {
    const keys = sortExtensionNavItems([
      { key: 'c', label: 'C' },
      { key: 'b', label: 'B', order: 2 },
      { key: 'a', label: 'A', order: 1 },
      { key: 'd', label: 'D' },
    ]).map((i) => i.key);
    expect(keys).toEqual(['a', 'b', 'c', 'd']);
  });

  it('navigating to an extension item selects its view', () => {
    const extensions: IClientExtensions = {
      navItems: [{ key: 'billing', label: 'Billing' }],
      views: [{ key: 'billing', render: () => createElement('span', null, 'Billing page') }],
    };
    const nav = new NavigationStore();
    nav.goToExtension('billing');
    expect(nav.view).toBe(toExtensionViewName('billing'));
    const view = findExtensionView(extensions, nav.view);
    expect(renderToStaticMarkup(createElement('div', null, view?.render()))).toBe(
      '<div><span>Billing page</span></div>',
    );
    nav.goToProjectList();
    expect(nav.view).toBe('projects');
  });

  it('provides the plan badge through the context', () => {
    const html = renderToStaticMarkup(
      createElement(
        ClientExtensionsProvider,
        { extensions: { renderPlanBadge: () => createElement('b', null, 'Pro') } },
        createElement(Probe),
      ),
    );
    expect(html).toBe('<div><b>Pro</b></div>');
  });
});
