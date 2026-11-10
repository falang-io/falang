import type React from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useDocsLinks } from '../docs/use-docs-links.js';

/** The top bar's "?" — opens the documentation home in a new tab; nothing when the build has no `VITE_DOCS_URL`. */
export const DocsButton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const t = getGlobalI18n().t;
  const { home } = useDocsLinks();
  if (!home) return null;
  return (
    <Tooltip title={t('client:app-header.docs')}>
      <Button
        type="text"
        style={style}
        icon={<QuestionCircleOutlined />}
        href={home}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('client:app-header.docs')}
        data-testid="docs-button"
      />
    </Tooltip>
  );
};
