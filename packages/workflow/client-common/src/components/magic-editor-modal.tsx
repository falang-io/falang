import type React from 'react';
import { useEffect, useState } from 'react';
import { reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Button, Modal, Spin, Typography } from 'antd';
import { QuestionView } from '@falang/antd';
import { getGlobalI18n, SchemeComponent, setSchemeStartPosition } from '@falang/scheme';
import type { IMagicPopup } from '../magic/build-magic-popup.js';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles: Record<string, React.CSSProperties> = {
  statusRow: { alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, minHeight: 28 },
  canvas: { height: '62vh', position: 'relative' },
};

interface ITarget {
  readonly documentId: string;
  readonly nodeId: string;
}

/**
 * Builds the popup scheme in the same effect that disposes it — a `useMemo`-built scheme would survive
 * React 18 StrictMode's mount→cleanup→mount while the cleanup disposed it (CLAUDE.md, ADR 0021 notes).
 * Rebuilds (from the main node) whenever `rebuildToken` changes, i.e. when a run ends.
 */
const usePopup = (target: ITarget, rebuildToken: number): IMagicPopup | null => {
  const store = useWorkflowStore();
  const [popup, setPopup] = useState<IMagicPopup | null>(null);
  useEffect(() => {
    const { documentId, nodeId } = target;
    let built: IMagicPopup | null = null;
    const onHeaderSpellCommitted = (prev: string, next: string): void => {
      if (!built) return;
      const popupState = built;
      const applyPopup = (): void => {
        const edit = popupState.read();
        store.magicRuns.applyEdit(documentId, nodeId, {
          children: edit.children,
          handEdited: popupState.hasEdits(),
          spell: edit.spell,
        });
      };
      if (popupState.read().children.length === 0) {
        applyPopup();
        store.magicRuns.startGenerate(documentId, nodeId);
        return;
      }
      store.magicRuns.requestConfirm({
        accept: () => {
          applyPopup();
          store.magicRuns.startUpdate(documentId, nodeId, prev, next);
        },
        kind: 'update',
      });
    };
    built = store.buildMagicPopup(documentId, nodeId, onHeaderSpellCommitted);
    setPopup(built);
    const timer = setTimeout(() => {
      if (built) setSchemeStartPosition(built.scheme);
    }, 10);
    return () => {
      clearTimeout(timer);
      built?.scheme.dispose();
    };
  }, [store, target, rebuildToken]);
  return popup;
};

const RunStatus: React.FC<{ target: ITarget }> = observer(({ target }) => {
  const store = useWorkflowStore();
  const t = getGlobalI18n().t;
  const { documentId, nodeId } = target;
  const state = store.magicRuns.getState(documentId, nodeId);
  return (
    <div style={styles.statusRow} data-testid="magic-editor-status" data-status={state.status}>
      {state.status === 'generating' && (
        <>
          <Spin size="small" />
          <Typography.Text>{t('client:magic.generating')}</Typography.Text>
          <Button
            size="small"
            data-testid="magic-editor-cancel-run"
            onClick={() => store.magicRuns.cancel(documentId, nodeId)}
          >
            {t('client:magic.cancel-run')}
          </Button>
        </>
      )}
      {state.status === 'asking' && state.question && (
        <div
          data-testid="magic-editor-question"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}
        >
          <QuestionView
            question={state.question}
            onAnswer={(answer) => store.magicRuns.answer(documentId, nodeId, answer)}
          />
        </div>
      )}
      {state.status === 'failed' && (
        <>
          <Typography.Text type="danger" data-testid="magic-editor-error">
            {t('client:magic.failed', { error: state.error ?? '' })}
          </Typography.Text>
          <Button
            size="small"
            data-testid="magic-editor-retry"
            onClick={() => store.magicRuns.retry(documentId, nodeId)}
          >
            {t('client:magic.retry')}
          </Button>
        </>
      )}
    </div>
  );
});

const MagicEditorBody: React.FC<{ target: ITarget }> = observer(({ target }) => {
  const store = useWorkflowStore();
  const t = getGlobalI18n().t;
  const [rebuildToken, setRebuildToken] = useState(0);
  const popup = usePopup(target, rebuildToken);
  const busy = store.magicRuns.isBusy(target.documentId, target.nodeId);

  // A run that just ended (filled, failed or cancelled) → show what the main node now holds.
  useEffect(
    () =>
      reaction(
        () => store.magicRuns.isBusy(target.documentId, target.nodeId),
        (isBusy, wasBusy) => {
          if (wasBusy && !isBusy) setRebuildToken((token) => token + 1);
        },
      ),
    [store, target],
  );

  // Read-only while a run owns the node.
  useEffect(() => {
    if (!popup) return;
    runInAction(() => {
      popup.scheme.isEditing = !busy;
    });
  }, [popup, busy]);

  const close = (): void => store.magicRuns.closeEditor();
  const ok = (): void => {
    if (popup) {
      const edit = popup.read();
      store.magicRuns.applyEdit(target.documentId, target.nodeId, {
        children: edit.children,
        handEdited: popup.hasEdits(),
        spell: edit.spell,
      });
    }
    close();
  };

  return (
    <Modal
      open
      centered
      width="90vw"
      destroyOnHidden
      maskClosable={false}
      // Escape belongs to the scheme's own inline editors here; letting it close the modal discarded every edit.
      keyboard={false}
      title={t('client:magic.title')}
      onCancel={close}
      footer={[
        <Button key="cancel" data-testid="magic-editor-cancel" onClick={close}>
          {t('client:magic.cancel')}
        </Button>,
        <Button key="ok" type="primary" data-testid="magic-editor-ok" disabled={busy || !popup} onClick={ok}>
          {t('client:magic.ok')}
        </Button>,
      ]}
      modalRender={(node) => <div data-testid="magic-editor-modal">{node}</div>}
    >
      <RunStatus target={target} />
      <div style={styles.canvas}>{popup && <SchemeComponent scheme={popup.scheme} />}</div>
    </Modal>
  );
});

/** The popup editor of one magic node (ADR 0046 (private)); opened by the host's `openEditor`. */
export const MagicEditorModal: React.FC = observer(() => {
  const store = useWorkflowStore();
  const target = store.magicRuns.openEditor;
  if (!target) return null;
  return <MagicEditorBody key={`${target.documentId}:${target.nodeId}`} target={target} />;
});
