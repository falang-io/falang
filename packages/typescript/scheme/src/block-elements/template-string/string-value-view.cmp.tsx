import { CodeViewComponent } from '../code/code.view.cmp.js';
import { TemplateStringViewComponent } from './template-string-view.cmp.js';
import { stringLiteralText } from './string-value-expression.js';

/**
 * A stored expression that is a whole string/template literal reads as text, the same way the
 * editor shows a string-typed value (`arr-push` into an array of strings, a `string` `create-var`);
 * any other expression is shown as code.
 */
export const StringValueViewComponent: React.FC<{ value: string }> = ({ value }) => {
  const text = stringLiteralText(value);
  return text === null ? <CodeViewComponent value={value} /> : <TemplateStringViewComponent value={text} />;
};
