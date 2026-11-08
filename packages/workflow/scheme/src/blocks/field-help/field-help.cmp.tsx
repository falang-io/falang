import { Popover } from 'antd';
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

/** The "?" next to a field label; renders nothing without `help`. See `IFieldConfig.help`. `t` is passed in — the credential/trigger dialogs have no scheme container. */
export const FieldHelp: React.FC<{ help?: string; t: TTranslate }> = ({ help, t }) => {
  if (!help) return null;
  return (
    <Popover content={<FieldHelpContent text={translateFieldText(t, help)} />} trigger={['hover', 'click']}>
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

/** A field caption followed by its "?" (when the field has `help`). */
export const FieldLabel: React.FC<{ label: string; help?: string; t: TTranslate }> = ({ label, help, t }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    {translateFieldText(t, label)}
    <FieldHelp help={help} t={t} />
  </span>
);
