import { schemeBaseTextStyle } from './styles';

let textElement: SVGTextElement | null = null;
let spaceWidth = 0;

if (globalThis.document) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  Object.assign(textElement.style, schemeBaseTextStyle);
  svg.appendChild(textElement);
  document.body.appendChild(svg);
  textElement.textContent = '\u00A0'; // Unitext space
  spaceWidth = textElement.getComputedTextLength();
}

export const getSpaceWidth = () => {
  return spaceWidth;
}

export const getTextWidth = (text: string): number => {
  if (!textElement) return 0;
  textElement.textContent = text;
  return textElement.getComputedTextLength();
}

export interface WordWidthInfo {
  word: string,
  width: number,
}

export interface WordsWidthResult {
  wordsWithComputedWidth: WordWidthInfo[],
  spaceWidth: number,
}

export interface TextLine {
  value: string
  width: number
}

export const calculateWordWidths = (text: string): WordsWidthResult[] => {
  const returnValue: WordsWidthResult[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Calculate length of each word to be used to determine number of words per line
    const words = line.split(/\s+/);

    const wordsWithComputedWidth = words.map(word => {
      return { word, width: getTextWidth(word) }
    });

    returnValue.push({ wordsWithComputedWidth, spaceWidth: getSpaceWidth() });
  }

  return returnValue;
}

export const calculateLines = (wordsWidthResult: WordsWidthResult[], lineWidth: number): TextLine[] => {
  let returnValue: TextLine[] = [];
  for (const widthResult of wordsWidthResult) {
    const { wordsWithComputedWidth, spaceWidth } = widthResult;
    const wordsByLines = wordsWithComputedWidth.reduce<{ words: string[], width: number }[]>((result, { word, width }) => {
      const lastLine = result[result.length - 1] || { words: [], width: 0 };

      if (lastLine.words.length === 0) {
        // First word on line
        const newLine = { words: [word], width };
        result.push(newLine);
      } else if (lastLine.width + width + spaceWidth < lineWidth) {
        // Word can be added to an existing line
        lastLine.words.push(word);
        lastLine.width += width + spaceWidth;
      } else {
        // Word too long to fit on existing line
        const newLine = { words: [word], width };
        result.push(newLine);
      }

      return result;
    }, []);
    returnValue = returnValue.concat(wordsByLines.map(line => ({
      value: line.words.join(' '),
      width: line.width,
    })));
  }
  return returnValue;
}