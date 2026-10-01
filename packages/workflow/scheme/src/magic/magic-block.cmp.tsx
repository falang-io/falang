import { TOKEN_I18N, useService, type IBlockView, type IBlockViewProps } from '@falang/scheme';
import type { TMagicData } from '@falang/workflow-dto';
import { observer } from 'mobx-react-lite';
import { TOKEN_MAGIC_HOST, type IMagicHost, type TMagicRunStatus } from './magic-host.js';

type TStatusIcon = TMagicRunStatus | 'handEdited' | 'none';

/** generating > asking > failed > modified by hand > none. */
export const pickMagicStatusIcon = (status: TMagicRunStatus, handEdited: boolean): TStatusIcon => {
  if (status === 'generating' || status === 'asking' || status === 'failed') return status;
  return handEdited ? 'handEdited' : 'none';
};

const GLYPHS: Record<Exclude<TStatusIcon, 'none' | 'idle'>, string> = {
  generating: '⟳',
  asking: '?',
  failed: '!',
  handEdited: '✎',
};

const useOptionalMagicHost = (): IMagicHost | null => {
  try {
    return useService(TOKEN_MAGIC_HOST);
  } catch {
    return null;
  }
};

const SpellText: React.FC<{ spell: string }> = ({ spell }) => {
  const t = useService(TOKEN_I18N).t;
  return spell.trim() ? (
    <span style={{ whiteSpace: 'pre-wrap' }}>{spell}</span>
  ) : (
    <span style={{ opacity: 0.55, fontStyle: 'italic' }}>{t('magic:placeholder')}</span>
  );
};

/** The `magic` node's only block in the main scheme: its `spell` as plain text plus a small status icon. */
export const MagicBlockComponent: IBlockView<TMagicData> = observer(({ data, icon }: IBlockViewProps<TMagicData>) => {
  const t = useService(TOKEN_I18N).t;
  const host = useOptionalMagicHost();
  const meta = icon.dataNode.meta;
  const status = host ? host.getStatus(icon.id) : 'idle';
  const kind = pickMagicStatusIcon(status, meta?.handEdited === true);
  const note = typeof meta?.note === 'string' && meta.note ? meta.note : '';
  const label = kind === 'none' || kind === 'idle' ? '' : t(`magic:status.${kind}`);
  const title = [label, note].filter(Boolean).join('\n');
  return (
    <div className="workflow-magic-block" title={title} style={{ display: 'flex', gap: 6 }}>
      <div style={{ flex: 1 }}>
        <SpellText spell={data?.spell ?? ''} />
      </div>
      {kind !== 'none' && kind !== 'idle' && (
        <span className={`workflow-magic-block__status workflow-magic-block__status--${kind}`} aria-label={label}>
          {GLYPHS[kind]}
        </span>
      )}
    </div>
  );
});

/** Header of the popup scheme: the spell, editable, no status. */
export const MagicFunctionHeaderBlockComponent: IBlockView<TMagicData> = observer(({ data }) => (
  <SpellText spell={data?.spell ?? ''} />
));

const StaticText: React.FC<{ textKey: string }> = observer(({ textKey }) => {
  const t = useService(TOKEN_I18N).t;
  return <div style={{ textAlign: 'center' }}>{t(textKey)}</div>;
});

export const MagicFunctionStartBlockComponent: IBlockView = () => <StaticText textKey="magic:start" />;
export const MagicFunctionEndBlockComponent: IBlockView = () => <StaticText textKey="magic:end" />;
