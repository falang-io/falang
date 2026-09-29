import type React from 'react';
import { Typography } from 'antd';

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '0 16px',
    height: 56,
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  title: { color: '#cdd6f4', margin: 0, whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
};

export interface ITopBarProps {
  title: React.ReactNode;
  /** Uniform action buttons (`<Button type="text">…`), `LanguageSwitcher`, badges, etc. — laid out in one row. */
  children?: React.ReactNode;
}

/** The top menu bar shared by the project list and the admin app: a title on the left, uniform actions on the right. */
export const TopBar: React.FC<ITopBarProps> = ({ title, children }) => (
  <div style={styles.root}>
    <Typography.Title level={4} style={styles.title}>
      {title}
    </Typography.Title>
    <div style={styles.actions}>{children}</div>
  </div>
);
