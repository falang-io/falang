import { observer } from 'mobx-react-lite';
import styled from '@emotion/styled';
import { CodeViewComponent } from '../code/code.view.cmp.js';
import { escapeForTemplateStringDisplay } from './escape-for-template-string-display.js';

export interface ITemplateStringViewComponentProps {
  value: string;
}

/**
 * The message is displayed wrapped in a synthetic template literal so Prism recognizes and
 * highlights it (incl. `${expr}` interpolations) as it does in the editor — the wrapping
 * backticks themselves stay hidden, matching `TemplateStringStore`'s hidden-prefix/-suffix treatment.
 */
const TemplateStringView = styled.div`
  .token.template-punctuation {
    display: none;
  }
`;

export const TemplateStringViewComponent: React.FC<ITemplateStringViewComponentProps> = observer(({ value }) => (
  <TemplateStringView>
    <CodeViewComponent value={`\`${escapeForTemplateStringDisplay(value)}\``} />
  </TemplateStringView>
));
