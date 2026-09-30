// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

/** @type {Record<string, string>} */
const SITE_BY_LOCALE = {
  en: 'https://docs.falang.io',
  ru: 'https://docs.falang.ru',
};

/** @type {Record<string, string>} */
const LOCALE_LABEL = {
  en: 'English',
  ru: 'Русский',
};

/** @type {Record<string, string>} */
const LOGIC_GROUP_LABEL = {
  en: 'Logic',
  ru: 'Логика',
};

/** @type {Record<string, string>} */
const WORKFLOW_GROUP_LABEL = {
  en: 'Workflow',
  ru: 'Workflow',
};

/** @type {Record<string, string>} */
const ARDUINO_GROUP_LABEL = {
  en: 'Arduino',
  ru: 'Arduino',
};

const locale = process.env.SITE_LOCALE ?? '';
const site = SITE_BY_LOCALE[locale];
if (!site) {
  throw new Error(
    `SITE_LOCALE env var must be one of ${Object.keys(SITE_BY_LOCALE).join(', ')}, got: ${JSON.stringify(locale)}`,
  );
}

// Yandex.Metrika counter — kept in sync with the marketing site's own copy
// (../main/src/layouts/base-layout.astro), since Starlight's `head` config only takes a raw
// script string, not a shared Astro component across the two standalone projects.
const yandexMetrikaScript = `
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) {
      if (document.scripts[j].src === r) { return; }
    }
    (k = e.createElement(t)), (a = e.getElementsByTagName(t)[0]), (k.async = 1), (k.src = r), a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  ym(91071305, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
`;

export default defineConfig({
  site,
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Falang',
      favicon: '/favicon.ico',
      // Single root locale, no URL prefix — each build (SITE_LOCALE=en|ru) ships one language on
      // its own subdomain, same per-build-locale model as the marketing site.
      locales: {
        root: { label: LOCALE_LABEL[locale], lang: locale },
      },
      // `autogenerate` deliberately not used here: it matches entries by their on-disk file path
      // relative to a hardcoded `src/content/docs` (see @astrojs/starlight/utils/collection.js's
      // getCollectionPathFromRoot), which doesn't know about this collection's actual per-locale
      // `base` in content.config.ts — every entry ends up looking like it's inside a `<locale>/`
      // subdirectory autogenerate never matches. Manual `slug` entries below use each entry's
      // content-layer id instead, which is already locale-flat, so they're unaffected.
      sidebar: [
        'icons',
        'basics',
        'text',
        'pdf-export',
        { label: LOGIC_GROUP_LABEL[locale], items: ['logic', 'logic/examples'] },
        {
          label: WORKFLOW_GROUP_LABEL[locale],
          items: [
            'workflow',
            'workflow/local-setup',
            'workflow/integrations',
            'workflow/schedule-triggers',
            'workflow/files',
            'workflow/databases',
            'workflow/human-tasks',
            'workflow/media',
            'workflow/ai-agent',
            'workflow/administration',
            'workflow/debugging',
            'workflow/versioning',
          ],
        },
        // Only `arduino/project-setup` and `arduino/debugging` exist so far — a fuller Arduino product
        // overview page analogous to `workflow`'s own is still a known gap (the Arduino desktop app itself
        // never got a top-level site/docs landing page), not something either of those pages' scope covers.
        { label: ARDUINO_GROUP_LABEL[locale], items: ['arduino/project-setup', 'arduino/debugging'] },
      ],
      // Every content page's section headings are `<h4>` (see e.g. `basics.mdx`/`logic/index.mdx`),
      // below Starlight's default "On this page" range of h2-h3 — without this, the sidebar TOC only
      // ever shows the built-in "Overview" link, with no real per-section anchors on any page.
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      // See its own header comment — caps how far the content+TOC area stretches on wide viewports.
      customCss: ['./src/styles/custom.css'],
      head: [{ tag: 'script', content: yandexMetrikaScript }],
      social: [{ icon: 'github', label: 'Source', href: 'https://github.com/falang-io/falang' }],
      components: {
        Header: './src/components/header.astro',
      },
    }),
    mdx(),
    sitemap(),
  ],
});
