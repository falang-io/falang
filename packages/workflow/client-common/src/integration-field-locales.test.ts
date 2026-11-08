import type { IFieldConfig, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { REGISTERED_INTEGRATIONS } from './integrations-registry.js';

const I18N_KEY_RE = /^[\w-]+:[\w.-]+$/;

const allFields = (integration: IWorkflowIntegration): IFieldConfig[] => [
  ...integration.credentialFields,
  ...integration.triggers.flatMap((trigger) => trigger.contextFields ?? []),
  ...integration.actions.flatMap((action) => action.fields),
  ...(integration.questions ?? []).flatMap((question) => question.contextFields.concat(question.questionFields)),
  ...(integration.choices ?? []).flatMap((choice) => choice.contextFields.concat(choice.promptFields)),
];

const lookup = (bundle: Record<string, unknown>, key: string): unknown => {
  const [namespace, path] = key.split(':');
  let node: unknown = bundle[namespace];
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
};

describe('integration field labels and help', () => {
  for (const integration of REGISTERED_INTEGRATIONS) {
    const loaders = integration.locales;
    if (!loaders) continue;
    it(`${integration.vendor}: every label/help key exists in en and ru`, async () => {
      const keys = allFields(integration)
        .flatMap((field) => [field.label, field.help ?? ''])
        .filter((text) => I18N_KEY_RE.test(text));
      const languages = ['en', 'ru'];
      const bundles = await Promise.all(
        languages.map(async (language) => {
          const loader = loaders[language];
          if (!loader) throw new Error(`${integration.vendor} has no ${language} locale`);
          const loaded = await loader();
          return loaded.default;
        }),
      );
      bundles.forEach((bundle, index) => {
        const missing = keys.filter((key) => typeof lookup(bundle, key) !== 'string');
        expect(missing, `${integration.vendor} ${languages[index]}`).toEqual([]);
      });
    });
  }
});
