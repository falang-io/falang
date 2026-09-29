import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getMonaco, useCodeTheme } from '@falang/typescript-scheme';
import type { TCodeLanguage } from '@falang/simple-code-dto';
import { monacoLanguageId, registerCodeLanguages } from './monaco-languages.js';

export interface IRawCodeViewComponentProps {
  value: string;
  language: TCodeLanguage;
}

/**
 * Read-only, no-validation counterpart of `@falang/typescript-scheme`'s `CodeViewComponent`. Uses
 * monaco's own `editor.colorize` instead of PrismJS — monaco already ships the tokenizer for every
 * language this domain needs (see `monaco-languages.ts`), so there is no need for 5 separate
 * `prismjs/components/prism-*` imports plus a light/dark theme CSS swap to duplicate it.
 */
export const RawCodeViewComponent: React.FC<IRawCodeViewComponentProps> = observer(({ value, language }) => {
  const theme = useCodeTheme();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const monacoApi = getMonaco();
    registerCodeLanguages(monacoApi);
    monacoApi.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    monacoApi.editor.colorize(value, monacoLanguageId(language), { tabSize: 2 }).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [value, language, theme]);

  return (
    <pre style={{ margin: 0, fontFamily: '"Courier New", monospace', fontSize: 12 }}>
      {html === null ? value : <code dangerouslySetInnerHTML={{ __html: html }} />}
    </pre>
  );
});
