import type React from 'react';
import { useEffect, useState } from 'react';
import { when } from 'mobx';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Spin, Tooltip } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import { authStore } from '../auth-store.js';
import { navigationStore } from '../navigation-store.js';
import { GuestProjectDataPort } from '../guest-project/guest-project-data-port.js';
import { saveGuestProjectDraft } from '../guest-project/guest-project-draft.js';
import { guestProjectId, loadGuestTemplate } from '../guest-project/load-guest-template.js';
import { WorkflowStore } from '../workflow-store.js';
import { useClientBrand } from '../extensions/client-extensions.js';
import { WorkspaceLayout } from './workspace-layout.js';

const S: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    borderBottom: '1px solid #313244',
    whiteSpace: 'nowrap',
    background: '#181825',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    flexShrink: 0,
  },
  name: {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 360,
    minWidth: 0,
    flexShrink: 1,
  },
  logo: { width: 22, height: 22, display: 'block' },
  spacer: { flex: 1 },
  center: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    background: '#1e1e2e',
  },
};

/** Leaves for the sign-in screen once the last edit has reached the draft; the template stays remembered. */
const goToSignIn = async (store: WorkflowStore): Promise<void> => {
  await store.flushPendingSaves();
  authStore.setScreen('signin');
  navigationStore.leaveTemplateForSignIn();
};

const GuestBar: React.FC<{ name: string; store: WorkflowStore }> = observer(({ name, store }) => {
  const t = getGlobalI18n().t;
  const brand = useClientBrand();
  // Only the logo — not `FalangBrand`'s link to the project list: the guest's one action is signing in.
  return (
    <div style={S.bar} data-testid="guest-template-bar">
      <img src={brand.logoUrl} alt={brand.name} style={S.logo} />
      <span style={S.name} title={name}>
        {name}
      </span>
      <span style={S.spacer} />
      <Tooltip title={t('client:guest-template.sign-in-hint')} placement="bottomRight">
        <Button
          type="primary"
          size="small"
          icon={<LoginOutlined />}
          data-testid="guest-sign-in-to-save"
          onClick={() => goToSignIn(store)}
        >
          {t('client:guest-template.sign-in-to-save')}
        </Button>
      </Tooltip>
    </div>
  );
});

/** The first trigger (else any scheme document) — what a guest sees on opening a template with no remembered tabs. */
const firstDocumentId = (store: WorkflowStore): string | null => {
  const documents = store.documents.filter((doc) => !doc.pinned);
  return (documents.find((doc) => doc.type === TRIGGER_FUNCTION_NAME) ?? documents[0])?.id ?? null;
};

/**
 * `#/templates/<key>` for a visitor who is not signed in: the template opens as an editable project kept in the
 * browser — no menus, no runs, no agent, only "Sign in to save". Edits are saved as the guest draft
 * (`guest-project-draft.ts`), which becomes the user's new project once they sign in or sign up
 * (`claimGuestProjectDraft`).
 */
export const GuestTemplateWorkspace: React.FC<{ templateKey: string }> = observer(({ templateKey }) => {
  const t = getGlobalI18n().t;
  const [opened, setOpened] = useState<{ store: WorkflowStore; name: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Created and disposed in the same effect, like `ProjectWorkspace`'s store (StrictMode's double mount).
  useEffect(() => {
    let cancelled = false;
    let store: WorkflowStore | null = null;
    let openFirstDisposer: (() => void) | null = null;
    setOpened(null);
    setNotFound(false);
    loadGuestTemplate(templateKey)
      .then(({ name, state }) => {
        if (cancelled) return;
        const dataPort = new GuestProjectDataPort(state, (next) =>
          saveGuestProjectDraft({ templateKey, name, state: next }),
        );
        const created = new WorkflowStore(guestProjectId(templateKey), { guest: { dataPort } });
        store = created;
        // The remembered tabs are restored first (`startWorkspaceSync`, registered in the store's constructor).
        openFirstDisposer = when(
          () => !created.isLoadingTree && !created.isLoadingDocuments,
          () => {
            if (created.activeTabId !== null) return;
            const id = firstDocumentId(created);
            if (id) created.openTab(id);
          },
        );
        setOpened({ store: created, name });
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
      openFirstDisposer?.();
      store?.dispose();
    };
  }, [templateKey]);

  if (notFound) {
    return (
      <div style={S.center} data-testid="guest-template-not-found">
        <Alert type="warning" showIcon message={t('client:guest-template.not-found')} />
        <Button
          type="primary"
          onClick={() => {
            authStore.setScreen('signin');
            navigationStore.closeTemplate();
          }}
        >
          {t('client:guest-template.to-sign-in')}
        </Button>
      </div>
    );
  }
  if (!opened) {
    return (
      <div style={S.center}>
        <Spin />
        <span style={{ color: '#6c7086', fontFamily: 'system-ui, sans-serif' }}>
          {t('client:guest-template.loading')}
        </span>
      </div>
    );
  }
  return <WorkspaceLayout store={opened.store} header={<GuestBar name={opened.name} store={opened.store} />} />;
});
