import { describe, expect, it } from 'vitest';
import { findAdminExtensionPage, toAdminExtensionPage, type IAdminExtensions } from './admin-extensions.js';

describe('admin extension pages', () => {
  const extensions: IAdminExtensions = { pages: [{ key: 'billing', label: 'Billing', render: () => null }] };

  it('addresses an extension page by its prefixed key', () => {
    expect(toAdminExtensionPage('billing')).toBe('ext:billing');
    expect(findAdminExtensionPage(extensions, 'ext:billing')?.label).toBe('Billing');
  });

  it('never resolves a built-in page or an unknown key', () => {
    expect(findAdminExtensionPage(extensions, 'billing')).toBeUndefined();
    expect(findAdminExtensionPage(extensions, 'ext:other')).toBeUndefined();
    expect(findAdminExtensionPage({}, 'ext:billing')).toBeUndefined();
  });
});
