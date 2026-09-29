import type React from 'react';
import { observer } from 'mobx-react-lite';
import { useService } from '../hooks/use-service.js';
import { TOKEN_I18N } from '../di-tokens.js';

interface TrueFalseWordsParams {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  trueOnRight: boolean;
  rightOnTop: boolean;
}

export const TrueFalseWords: React.FC<TrueFalseWordsParams> = observer(
  ({ leftX, leftY, rightX, rightY, trueOnRight, rightOnTop }) => {
    const t = useService(TOKEN_I18N).t;
    const lx = leftX - 33;
    const ly = leftY;
    const rx = rightX + 1;
    const ry = rightOnTop ? rightY - 12 : rightY;
    const [trueX, trueY] = trueOnRight ? [rx, ry] : [lx, ly];
    const [falseX, falseY] = trueOnRight ? [lx, ly] : [rx, ry];
    return (
      <>
        <div
          style={{
            position: 'absolute',
            left: trueX,
            top: trueY,
            color: 'green',
            fontSize: 10,
          }}
        >
          {t('base:true')}
        </div>
        <div
          style={{
            position: 'absolute',
            left: falseX,
            top: falseY,
            color: 'red',
            fontSize: 10,
          }}
        >
          {t('base:false')}
        </div>
      </>
    );
  },
);
