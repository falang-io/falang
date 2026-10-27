import type React from 'react';
import { useCallback, useState } from 'react';
import { Alert, Button, Input, Modal, Popconfirm, Switch, Typography } from 'antd';
import { CMD_SET_DATA, getGlobalI18n } from '@falang/scheme';
import {
  isWebhookSignatureRequired,
  parseWebhookSignatureVersion,
  WEBHOOK_REQUIRE_SIGNATURE_FIELD,
  WEBHOOK_SIGNATURE_VERSION_FIELD,
} from '@falang/workflow-integrations-webhook';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { workflowApi } from '../api-client.js';
import type { IApiWebhookSecret } from '../api-types.js';
import { useWorkflowStore } from '../workflow-store-context.js';

type TEnv = 'dev' | 'prod';
const ENVS: readonly TEnv[] = ['dev', 'prod'];
const FETCH_ATTEMPTS = 4;
const FETCH_RETRY_MS = 1000;

interface IProps {
  readonly documentId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const copy = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard unavailable (insecure context) — the value stays selectable in the field
  }
};

const buildExample = (secret: IApiWebhookSecret): string =>
  `curl -X POST '<webhook URL>' -H 'Content-Type: application/json' -H '${secret.header}: ${secret.secret}' -d '{"hello":"world"}'`;

/**
 * "Webhook security": switches `require_signature` of a generic webhook trigger, shows its server-derived secret
 * (per environment, on demand) and rotates it (`signature_version`). Edits go through the live scheme like any other edit,
 * so they are undoable and autosaved; the secret route reads the stored document, hence the short wait for the save.
 */
export const WebhookSecurityModal: React.FC<IProps> = observer(({ documentId, open, onClose }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [secrets, setSecrets] = useState<Partial<Record<TEnv, IApiWebhookSecret>>>({});
  const [loadingEnv, setLoadingEnv] = useState<TEnv | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scheme = open ? store.getScheme(documentId) : null;
  const body = scheme?.rootNode?.children[1];
  const data = body ? (toJS(body.data) as Record<string, unknown>) : null;
  const config = (data?.triggerConfig ?? {}) as Record<string, string>;
  const required = isWebhookSignatureRequired(config);
  const version = parseWebhookSignatureVersion(config[WEBHOOK_SIGNATURE_VERSION_FIELD]);

  const writeConfig = useCallback(
    (patch: Record<string, string>): void => {
      if (!scheme || !body || !data) return;
      setSecrets({});
      setErrorMessage(null);
      scheme.commands.dispatchCommand(CMD_SET_DATA, {
        id: body.id,
        data: { ...data, triggerConfig: { ...config, ...patch } },
      });
    },
    [scheme, body, data, config],
  );

  /** The route reads the stored document, so wait (a few tries) until the autosave of our own change has landed. */
  const fetchWhenSaved = async (env: TEnv, attemptsLeft: number): Promise<IApiWebhookSecret | null> => {
    const result = await workflowApi.getWebhookSecret(store.projectId, documentId, env);
    if (result.required === required && result.version === version) return result;
    if (attemptsLeft <= 1) return null;
    await sleep(FETCH_RETRY_MS);
    return fetchWhenSaved(env, attemptsLeft - 1);
  };

  const show = async (env: TEnv): Promise<void> => {
    setLoadingEnv(env);
    setErrorMessage(null);
    try {
      const result = await fetchWhenSaved(env, FETCH_ATTEMPTS);
      if (result) setSecrets((current) => ({ ...current, [env]: result }));
      else setErrorMessage(t('client:webhook-security.still-saving'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('client:webhook-security.failed-to-load'));
    } finally {
      setLoadingEnv(null);
    }
  };

  return (
    <Modal
      title={t('client:webhook-security.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={640}
      data-testid="webhook-security-modal"
    >
      {!data && <Alert type="error" showIcon message={t('client:webhook-security.failed-to-load')} />}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Switch
              checked={required}
              onChange={(value) => writeConfig({ [WEBHOOK_REQUIRE_SIGNATURE_FIELD]: value ? 'true' : 'false' })}
              data-testid="webhook-require-signature"
            />
            <span>{t('client:webhook-security.require')}</span>
          </div>
          <Typography.Text type="secondary">{t('client:webhook-security.hint')}</Typography.Text>
          {errorMessage && <Alert type="error" showIcon message={errorMessage} />}
          {required && (
            <>
              {ENVS.map((env) => {
                const secret = secrets[env];
                return (
                  <div key={env} data-testid={`webhook-secret-${env}`}>
                    <Typography.Text strong>{t(`client:webhook-security.env-${env}`)}</Typography.Text>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Input.Password
                        readOnly
                        value={secret?.secret ?? ''}
                        placeholder={secret ? '' : '••••••••'}
                        visibilityToggle={{ visible: Boolean(secret) }}
                      />
                      {secret ? (
                        <Button
                          onClick={() => {
                            copy(secret.secret);
                          }}
                        >
                          {t('client:webhook-security.copy')}
                        </Button>
                      ) : (
                        <Button
                          loading={loadingEnv === env}
                          onClick={() => {
                            show(env);
                          }}
                        >
                          {t('client:webhook-security.show')}
                        </Button>
                      )}
                    </div>
                    {secret && (
                      <Typography.Paragraph
                        copyable={{ text: buildExample(secret) }}
                        code
                        style={{ marginTop: 6, marginBottom: 0, wordBreak: 'break-all' }}
                      >
                        {buildExample(secret)}
                      </Typography.Paragraph>
                    )}
                  </div>
                );
              })}
              <Typography.Text type="secondary">
                {t('client:webhook-security.how-to', {
                  header: 'X-Webhook-Secret',
                  signatureHeader: 'X-Webhook-Signature',
                })}
              </Typography.Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Popconfirm
                  title={t('client:webhook-security.rotate-confirm')}
                  okText={t('client:webhook-security.rotate')}
                  onConfirm={() => writeConfig({ [WEBHOOK_SIGNATURE_VERSION_FIELD]: String(version + 1) })}
                >
                  <Button danger data-testid="webhook-rotate-secret">
                    {t('client:webhook-security.rotate')}
                  </Button>
                </Popconfirm>
                <Typography.Text type="secondary">{t('client:webhook-security.version', { version })}</Typography.Text>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
});
