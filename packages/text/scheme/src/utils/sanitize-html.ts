import DOMPurify from 'dompurify';

/**
 * Sanitizer for HTML that comes from document data (imports, the in-app agent, MCP) before it is
 * rendered via `dangerouslySetInnerHTML`. Keeps what the rich-text editors produce (formatting,
 * lists, alignment, links, images with `data:`/`https:` sources) and drops scripts, `on*` handlers,
 * `javascript:` URLs and dangerous inline CSS. (Duplicated in `@falang/text-scheme` on purpose — the
 * two packages do not depend on each other.)
 */
const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
  'ul',
];

const ALLOWED_ATTR = ['alt', 'class', 'dir', 'height', 'href', 'rel', 'src', 'style', 'target', 'title', 'width'];

const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'list-style-type',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'padding-left',
  'text-align',
  'text-decoration',
  'vertical-align',
  'white-space',
  'width',
]);

const DANGEROUS_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|\\|<|\/\*/i;

const filterStyle = (style: string): string =>
  style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1);
      return ALLOWED_STYLE_PROPERTIES.has(property) && !DANGEROUS_STYLE_VALUE.test(value);
    })
    .join('; ');

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

let hookInstalled = false;
const installHook = (): void => {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!node.hasAttribute('style')) return;
    const filtered = filterStyle(node.getAttribute('style') ?? '');
    if (filtered) node.setAttribute('style', filtered);
    else node.removeAttribute('style');
  });
};

export const sanitizeHtml = (html: string): string => {
  // Without a DOM (`isSupported === false`) DOMPurify returns its input untouched — never trust that.
  if (!DOMPurify.isSupported) return escapeHtml(html);
  installHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // `data:` only for images; everything else keeps the usual safe-scheme rule.
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|bmp|avif);|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  });
};
