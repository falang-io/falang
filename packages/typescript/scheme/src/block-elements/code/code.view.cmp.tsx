import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import './prism-styles.css';
import { useCodeTheme } from '../../monaco/use-code-theme.js';
import { applyPrismTheme } from './prism-theme.js';

export interface ICodeViewComponentProps {
  value: string;
}

export const CodeViewComponent: React.FC<ICodeViewComponentProps> = observer(({ value }) => {
  const codeRef = useRef<HTMLElement>(null);
  const theme = useCodeTheme();

  useEffect(() => {
    applyPrismTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [value, theme]);

  return (
    <pre className="language-typescript">
      <code ref={codeRef} className="language-typescript">
        {value}
      </code>
    </pre>
  );
});
