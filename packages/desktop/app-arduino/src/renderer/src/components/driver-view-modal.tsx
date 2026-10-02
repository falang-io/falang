import type React from 'react';
import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Modal, Tabs } from 'antd';
import { getMonaco } from '@falang/typescript-scheme';
import { getGlobalI18n } from '@falang/scheme';
import { driversModalStore } from '../drivers-modal-store.js';

const languageOf = (fileName: string): string => (fileName.endsWith('.json') ? 'json' : 'cpp');

/** One read-only Monaco editor over `value`; created on mount and disposed (editor and model) on unmount/change. */
const ReadOnlyCode: React.FC<{ value: string; language: string }> = ({ value, language }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const monaco = getMonaco();
    const model = monaco.editor.createModel(value, language);
    const editor = monaco.editor.create(host, {
      model,
      readOnly: true,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      theme: 'vs',
    });
    return () => {
      editor.dispose();
      model.dispose();
    };
  }, [value, language]);
  return <div ref={hostRef} style={{ height: 420, border: '1px solid #d9d9d9' }} />;
};

/** "View": a read-only Monaco tab per file — the pretty-printed `driver.config.json` first, then every source file. */
export const DriverViewModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const viewing = driversModalStore.viewing;
  const files = viewing
    ? [
        { name: 'driver.config.json', text: JSON.stringify(viewing.bundle.config, null, 2) },
        ...Object.entries(viewing.bundle.files).map(([name, text]) => ({ name, text })),
      ]
    : [];
  return (
    <Modal
      title={viewing ? `${viewing.id} (${t(`drivers:group.${viewing.scope}`)})` : ''}
      open={viewing !== null}
      onCancel={() => driversModalStore.closeViewing()}
      width={900}
      footer={[
        <Button key="close" onClick={() => driversModalStore.closeViewing()}>
          {t('drivers:close')}
        </Button>,
      ]}
      destroyOnHidden
    >
      <Tabs
        items={files.map((file) => ({
          key: file.name,
          label: file.name,
          children: <ReadOnlyCode value={file.text} language={languageOf(file.name)} />,
        }))}
      />
    </Modal>
  );
});
