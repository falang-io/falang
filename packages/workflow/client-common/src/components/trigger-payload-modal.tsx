import { Alert, Button, Modal, Space, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import { ContainerContext, getGlobalI18n } from '@falang/scheme';
import type { TVariableInfo } from '@falang/typescript-dto';
import { buildHiddenScopeCode, CodeModelStore, ExpressionEditorCellComponent } from '@falang/typescript-scheme';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import {
  buildSamplePayload,
  findDocumentTrigger,
  loadLastTriggerPayload,
  parseTriggerPayload,
  saveLastTriggerPayload,
} from '../trigger-run/trigger-payload.js';
import type { WorkflowDocument } from '../workflow-types.js';
import { useWorkflowStore } from '../workflow-store-context.js';

const PAYLOAD_VARIABLE = '__falangTriggerPayload';
const ANY_TYPE: TVariableInfo = { type: 'any' };

export interface ITriggerPayloadModalProps {
  readonly open: boolean;
  readonly mode: 'run' | 'debug';
  readonly document: WorkflowDocument | null;
  readonly onClose: () => void;
  /** Starts the run/debug session with the payload; resolves `true` on success (the modal then closes). */
  readonly onStart: (payload: Record<string, unknown>) => Promise<boolean>;
}

/**
 * Test payload for running or debugging a signal-delivery trigger-function on the dev stand: the event
 * its trigger would deliver (e.g. a Telegram message), typed in as JSON and type-checked against the
 * trigger's payload type. The last payload per document is remembered (`localStorage`); the first time
 * a skeleton of the type is offered.
 */
export const TriggerPayloadModal: React.FC<ITriggerPayloadModalProps> = observer(
  ({ open, mode, document, onClose, onStart }) => {
    const t = getGlobalI18n().t;
    const store = useWorkflowStore();
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    const trigger = useMemo(() => findDocumentTrigger(document?.data, REGISTERED_INTEGRATIONS), [document]);
    const payloadType = trigger?.scopeType ?? ANY_TYPE;
    const resolveStruct = (id: string) => store.typesRegistry.types.get(id)?.properties ?? null;
    const sampleText = () => JSON.stringify(buildSamplePayload(payloadType, resolveStruct), null, 2);
    const hiddenPrefix = `${buildHiddenScopeCode(
      [{ name: PAYLOAD_VARIABLE, type: { ...payloadType, constant: true } }],
      store.typesRegistry,
    )}let _value: typeof ${PAYLOAD_VARIABLE} = \n`;

    const [codeStore, setCodeStore] = useState<CodeModelStore | null>(null);
    useEffect(() => {
      if (!open || !document)
        return () => {
          // Nothing was created for a closed modal.
        };
      setError(null);
      const created = new CodeModelStore({
        id: `trigger-payload-${document.id}`,
        value: loadLastTriggerPayload(store.projectId, document.id) ?? sampleText(),
        hiddenPrefix,
      });
      setCodeStore(created);
      return () => {
        setCodeStore(null);
        created.dispose();
      };
      // The model is rebuilt per opening; the prefix/sample only depend on the document's trigger.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open, document]);

    const start = async () => {
      if (!codeStore || !document) return;
      const parsed = parseTriggerPayload(codeStore.value);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      if (codeStore.hasErrors) {
        setError(t('client:trigger-payload-modal.type-mismatch'));
        return;
      }
      setError(null);
      saveLastTriggerPayload(store.projectId, document.id, codeStore.value);
      setStarting(true);
      try {
        if (await onStart(parsed.payload)) onClose();
      } finally {
        setStarting(false);
      }
    };

    const title =
      mode === 'debug'
        ? t('client:trigger-payload-modal.title-debug', { name: document?.name ?? '' })
        : t('client:trigger-payload-modal.title-run', { name: document?.name ?? '' });

    return (
      <Modal
        open={open}
        title={title}
        width={720}
        onCancel={onClose}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => codeStore?.setValue(sampleText())}>{t('client:trigger-payload-modal.reset')}</Button>
            <Button onClick={onClose}>{t('client:trigger-payload-modal.cancel')}</Button>
            <Button type="primary" loading={starting} onClick={() => start()} data-testid="trigger-payload-start">
              {mode === 'debug' ? t('client:trigger-payload-modal.debug') : t('client:trigger-payload-modal.run')}
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">{t('client:trigger-payload-modal.hint')}</Typography.Paragraph>
        {!trigger && <Alert type="info" showIcon message={t('client:trigger-payload-modal.unknown-type')} />}
        {codeStore && (
          <ContainerContext value={store.container}>
            <div data-testid="trigger-payload-editor">
              <ExpressionEditorCellComponent
                store={codeStore}
                hiddenPrefix={hiddenPrefix}
                variant="default"
                minHeight={240}
              />
            </div>
          </ContainerContext>
        )}
        {error && <Alert style={{ marginTop: 12 }} type="error" showIcon message={error} />}
      </Modal>
    );
  },
);
