import { expect, test } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  getIntegrationsDocumentId,
  loginViaUI,
  openIntegrationsViaUI,
} from './fixtures.js';
import { RUNNER_MOCKS_URL, uniqueSuffix } from './integration-test-helpers.js';

/**
 * Browser tier for ADR 0081 (private), the built-in AI provider: the admin configures it on the admin page (base URL,
 * key, a model loaded from the provider's own `/models` — the OpenAI mock — plus one typed by hand), then a project's
 * OpenAI integration gets the "Built-in provider" switch; with it on the endpoint/key fields are hidden and the saved
 * instance carries `platformProvider: true` and no key. The relay (calls through the provider) is the workflow tier.
 */
test.describe('built-in AI provider', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin configures the provider; an OpenAI integration switches to it', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await createApiContext();
    try {
      await api.delete('/admin/settings/ai-provider');

      await loginViaUI(page);
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'Built-in provider' }).click();
      await expect(page.getByTestId('ai-provider-page')).toBeVisible();
      await expect(page.getByTestId('ai-provider-status')).toContainText('Not configured');

      await page.getByTestId('ai-provider-base-url').fill(`${RUNNER_MOCKS_URL}/openai`);
      await page.getByTestId('ai-provider-api-key').fill(`sk-e2e-${uniqueSuffix()}`);

      // "Load from provider" lists the mock's models with the typed (unsaved) endpoint and key.
      await page.getByTestId('ai-provider-load-models').click();
      const picker = page.getByTestId('ai-provider-picker');
      await expect(picker).toContainText('mock-model');
      await picker
        .getByRole('row', { name: /mock-model/ })
        .getByRole('checkbox')
        .check();
      await page.getByTestId('ai-provider-picker-add').click();
      await expect(page.getByTestId('ai-provider-model-id-0')).toHaveValue('mock-model');

      await page.getByTestId('ai-provider-add-model').click();
      await page.getByTestId('ai-provider-model-id-1').fill('gpt-4o-mini');
      await page.getByTestId('ai-provider-model-label-1').fill('GPT-4o mini');
      await page.getByTestId('ai-provider-save').click();
      await expect(page.getByTestId('ai-provider-status')).toContainText('Configured');

      const statusResponse = await api.get('/ai-provider');
      const status = (await statusResponse.json()) as {
        configured: boolean;
        models: { id: string; label: string; kind: string }[];
      };
      expect(status).toEqual({
        configured: true,
        models: [
          { id: 'mock-model', kind: 'chat', label: 'mock-model' },
          { id: 'gpt-4o-mini', kind: 'chat', label: 'GPT-4o mini' },
        ],
      });

      await page.goto('/');
      const projectId = await createProjectViaUI(page, `AI provider ${uniqueSuffix()}`);
      await openIntegrationsViaUI(page);
      await page.getByRole('button', { name: '+ Add integration' }).click();
      await page.getByRole('combobox', { name: 'Vendor' }).fill('OpenAI');
      await page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
        .filter({ hasText: 'OpenAI' })
        .first()
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Base URL')).toBeVisible();
      await page.getByTestId('ai-provider-switch').click();
      await expect(dialog.getByLabel('Base URL')).toBeHidden();
      await dialog.getByRole('button', { name: /^(Save|OK|Add)$/ }).click();
      await expect(page.getByTestId('ai-provider-tag')).toBeVisible();

      const documentId = await getIntegrationsDocumentId(api, projectId);
      await expect
        .poll(
          async () => {
            const response = await api.get(`/projects/${projectId}/documents`);
            const documents = (await response.json()) as {
              id: string;
              data: { instances?: { vendor: string; platformProvider?: boolean; fields: Record<string, unknown> }[] };
            }[];
            return documents.find((document) => document.id === documentId)?.data.instances ?? [];
          },
          { timeout: 15_000 },
        )
        .toEqual([
          expect.objectContaining({
            fields: { apiKey: { dev: '', prod: '' }, baseUrl: '' },
            platformProvider: true,
            vendor: 'openai',
          }),
        ]);

      // The instance saved by the editor feeds the model select the same way a node editor loads it: the admin's chat
      // models, not the instance's own (empty) endpoint.
      const documentsResponse = await api.get(`/projects/${projectId}/documents`);
      const documents = (await documentsResponse.json()) as { id: string; data: { instances?: { id: string }[] } }[];
      const instanceId = documents.find((document) => document.id === documentId)?.data.instances?.[0]?.id ?? '';
      const optionsResponse = await api.get(
        `/projects/${projectId}/integrations/${instanceId}/actions/call-ai-text/fields/model/options`,
      );
      expect(optionsResponse.status()).toBe(200);
      expect(await optionsResponse.json()).toEqual([
        { value: 'mock-model', label: 'mock-model' },
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      ]);
    } finally {
      await api.delete('/admin/settings/ai-provider');
      await api.dispose();
    }
  });
});
