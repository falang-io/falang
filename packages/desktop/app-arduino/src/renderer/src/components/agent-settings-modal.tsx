import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Form, Input, Modal } from 'antd';
import type { IAgentSettings } from '@falang/desktop-llm-client';
import { settingsModalStore } from '../settings-modal-store.js';
import { reportError } from '../../../shared/report-error.js';

const EMPTY_SETTINGS: IAgentSettings = { apiKey: '', baseUrl: '', model: '' };

/**
 * App-wide agent settings (OpenAI-compatible base URL / API key / model) — no per-project credential
 * concept on desktop, unlike the workflow product's `IntegrationInstance` (see
 * ADR 0026 (private)). Persisted in `main`'s `settings.json`, read/written fresh
 * on every open/save rather than kept in a live store — this modal is the only place that reads it,
 * and `ElectronLlmClient` reads it itself on every `complete()` call via `main`.
 */
export const AgentSettingsModal: React.FC = observer(() => {
  const [form] = Form.useForm<IAgentSettings>();
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsModalStore.isOpen) return;
    globalThis.falang.settings
      .getAgentSettings()
      .then((settings) => form.setFieldsValue(settings ?? EMPTY_SETTINGS))
      .catch((error: unknown) => reportError('Failed to load agent settings', error));
  }, [settingsModalStore.isOpen, form]);

  const handleOk = (): void => {
    form
      .validateFields()
      .then(async (values) => {
        setSaving(true);
        await globalThis.falang.settings.setAgentSettings(values);
        setSaving(false);
        settingsModalStore.close();
      })
      .catch((error: unknown) => {
        setSaving(false);
        if (error instanceof Error) reportError('Failed to save agent settings', error);
      });
  };

  return (
    <Modal
      title="Agent settings"
      open={settingsModalStore.isOpen}
      onOk={handleOk}
      confirmLoading={isSaving}
      onCancel={() => settingsModalStore.close()}
    >
      <Form form={form} layout="vertical" initialValues={EMPTY_SETTINGS}>
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[{ required: true, message: 'Required' }]}
          tooltip="An OpenAI-compatible /chat/completions endpoint, e.g. https://api.openai.com/v1"
        >
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item name="apiKey" label="API key">
          <Input.Password placeholder="sk-…" />
        </Form.Item>
        <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>
      </Form>
    </Modal>
  );
});
