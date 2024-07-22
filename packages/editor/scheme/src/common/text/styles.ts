import { FONT_SIZE } from '../constants';

export const fontFamily: React.CSSProperties = {
  fontFamily: 'Courier New, monospace',
};

export const schemeBaseTextStyle: React.CSSProperties = {
  ...fontFamily,
  fontSize: `${FONT_SIZE}px`,
  fontWeight: '400',
} ;

export const textStyle = schemeBaseTextStyle;
