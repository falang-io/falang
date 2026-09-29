import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const value = process.env.SITE_LOCALE;
if (value !== 'en' && value !== 'ru') {
  throw new Error(`SITE_LOCALE env var must be "en" or "ru", got: ${JSON.stringify(value)}`);
}

// Collection must be named "docs" — Starlight's sidebar `slug`/`autogenerate` entries and its
// automatic root-level routing both resolve against a collection literally named "docs".
// Each build only ever reads one locale's directory (SITE_LOCALE, same model as the marketing
// site — see astro.config.mjs), so ids come out flat with no locale segment to strip.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: `./src/content/docs/${value}` }),
  schema: docsSchema(),
});

export const collections = { docs };
