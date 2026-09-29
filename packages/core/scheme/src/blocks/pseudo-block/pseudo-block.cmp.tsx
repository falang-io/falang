import { observer } from 'mobx-react-lite';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_I18N, TOKEN_SCHEME } from '../../di-tokens.js';
import type { IBlockView } from '../../types/block-config.js';
import styled from '@emotion/styled';
import type { ITheme } from '../../types/theme.js';

const PseudoBlockContainer = styled.div<{ theme: ITheme }>`
  border-style: solid;
  border-width: 1px;
  line-height: 14px;
  white-space: nowrap;
  border-color: ${({ theme }) => theme.iconBorderColor};
  background-color: ${({ theme }) => theme.iconBackground};
`;

export const getPseudoBlockComponent = (text: string): IBlockView<unknown> =>
  observer(() => {
    const scheme = useService(TOKEN_SCHEME);
    if (!scheme.isEditing) return null;
    const t = useService(TOKEN_I18N).t;
    return <PseudoBlockContainer theme={scheme.theme.value}>{t(text)}</PseudoBlockContainer>;
  });
