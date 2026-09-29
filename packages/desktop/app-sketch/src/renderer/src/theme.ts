/**
 * app-sketch's light-theme palette (ADR 0005 (private)'s "Implementation notes (light theme for
 * app-sketch …)") — unlike `packages/desktop/app-arduino`/the workflow product's client, which stay
 * dark, this app's whole chrome is light, matching antd's own default (`theme.defaultAlgorithm`,
 * i.e. `ConfigProvider` with no `algorithm` override at all — see `app.tsx`). Every renderer
 * component that needs a color outside what antd itself already provides (a plain `<div>`/`<input>`,
 * not an antd component reading its own tokens) should import from here instead of hardcoding a hex
 * value, so the whole app's palette stays in one place.
 *
 * Values are chosen to sit alongside antd's own default light tokens (`colorBgContainer: '#ffffff'`,
 * `colorBorder: '#d9d9d9'`, `colorText: 'rgba(0, 0, 0, 0.88)'`, `colorTextTertiary: '#8c8c8c'`,
 * `colorPrimary: '#1677ff'`), not reinvent them.
 */
export const appTheme = {
  /** Main canvas / page background. */
  background: '#ffffff',
  /** Panel background — sidebar, project tree, welcome page. */
  panelBackground: '#fafafa',
  /** Slightly darker panel background — hover rows, "new item" input, buttons. */
  panelBackgroundAlt: '#f0f0f0',
  /** Default border color, matches antd's `colorBorder`. */
  border: '#d9d9d9',
  /** Primary text color, matches antd's `colorText`. */
  text: 'rgba(0, 0, 0, 0.88)',
  /** Secondary/muted text — hints, timestamps, placeholders. */
  textMuted: '#8c8c8c',
  /** Accent color, matches antd's `colorPrimary`. */
  accent: '#1677ff',
  /** A light "selected/active" tint, e.g. for the new-item input's focus border. */
  accentBorder: '#91caff',
  /** The document-lock overlay's translucent backing — light instead of the previous dark scrim. */
  overlayBackground: 'rgba(255, 255, 255, 0.82)',
  /** Drop-shadow for floating elements (context menus). */
  shadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
} as const;
