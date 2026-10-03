import type React from 'react';
import { useState } from 'react';
import { Button, notification, Popconfirm } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';

export interface ITerminateRunButtonProps {
  /** Performs the termination; a rejection is shown as an error notification. */
  readonly onTerminate: () => Promise<void>;
}

/** "Terminate" for a running execution, behind a confirmation — shared by the live run panel and the run detail drawer. */
export const TerminateRunButton: React.FC<ITerminateRunButtonProps> = ({ onTerminate }) => {
  const t = getGlobalI18n().t;
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onTerminate();
    } catch (error) {
      notification.error({ message: error instanceof Error ? error.message : t('client:terminate-run.failed') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popconfirm
      title={t('client:terminate-run.confirm')}
      okText={t('client:terminate-run.ok')}
      cancelText={t('client:terminate-run.cancel')}
      okButtonProps={{ danger: true }}
      onConfirm={handleConfirm}
    >
      <Button size="small" danger icon={<StopOutlined />} loading={loading} data-testid="terminate-run">
        {t('client:terminate-run.button')}
      </Button>
    </Popconfirm>
  );
};
