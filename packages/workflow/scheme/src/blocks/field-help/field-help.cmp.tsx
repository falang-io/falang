import { Popover, Tooltip } from 'antd';
import { Fragment } from 'react';
import { splitHelpLine, translateFieldText } from './field-help.js';

const ICON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  marginLeft: 4,
  borderRadius: '50%',
  border: '1px solid currentColor',
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 600,
  opacity: 0.55,
  cursor: 'help',
  verticalAlign: 'middle',
  flexShrink: 0,
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.92em',
  padding: '0 3px',
  borderRadius: 3,
  background: 'rgba(127, 127, 127, 0.15)',
};

const FieldHelpContent: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ maxWidth: 440, whiteSpace: 'pre-wrap' }}>
    {text.split('\n').map((line, lineIndex) => (
      // oxlint-disable-next-line no-array-index-key -- static text, lines never reorder.
      <div key={lineIndex} style={line ? {} : { height: 6 }}>
        {splitHelpLine(line).map((part, partIndex) =>
          part.code ? (
            // oxlint-disable-next-line no-array-index-key -- static text.
            <code key={partIndex} style={CODE_STYLE}>
              {part.text}
            </code>
          ) : (
            // oxlint-disable-next-line no-array-index-key -- static text.
            <Fragment key={partIndex}>{part.text}</Fragment>
          ),
        )}
      </div>
    ))}
  </div>
);

type TTranslate = (key: string) => string;

/** A documentation page for the field (see `IFieldConfig.docsTopic`): `url` absolute, `title` already translated. */
export interface IFieldDocsLink {
  readonly url: string;
  readonly title: string;
}

const LINK_ICON_STYLE: React.CSSProperties = {
  ...ICON_STYLE,
  cursor: 'pointer',
  color: 'inherit',
  textDecoration: 'none',
};

/**
 * The "?" next to a field label; renders nothing without `help` and `docs`. `help` alone — a popover
 * (`IFieldConfig.help`); `docs` alone — the "?" is a link to the page (new tab); both — the popover ends with that
 * link. `t` is passed in — the credential/trigger dialogs have no scheme container.
 */
export const FieldHelp: React.FC<{ help?: string; docs?: IFieldDocsLink | null; t: TTranslate }> = ({
  help,
  docs,
  t,
}) => {
  if (!help && !docs) return null;
  if (!help && docs) {
    return (
      <Tooltip title={docs.title}>
        <a
          href={docs.url}
          target="_blank"
          rel="noopener noreferrer"
          style={LINK_ICON_STYLE}
          aria-label={docs.title}
          data-testid="field-docs-link"
        >
          ?
        </a>
      </Tooltip>
    );
  }
  const content = (
    <div>
      <FieldHelpContent text={translateFieldText(t, help ?? '')} />
      {docs && (
        <a href={docs.url} target="_blank" rel="noopener noreferrer" data-testid="field-docs-link">
          {docs.title}
        </a>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger={['hover', 'click']}>
      <span
        style={ICON_STYLE}
        role="img"
        aria-label="?"
        data-testid="field-help"
        onClick={(event) => event.preventDefault()}
      >
        ?
      </span>
    </Popover>
  );
};

/** A field caption followed by its "?" (when the field has `help` or a documentation link). */
export const FieldLabel: React.FC<{ label: string; help?: string; docs?: IFieldDocsLink | null; t: TTranslate }> = ({
  label,
  help,
  docs,
  t,
}) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    {translateFieldText(t, label)}
    <FieldHelp help={help} docs={docs} t={t} />
  </span>
);
