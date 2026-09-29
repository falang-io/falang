export type TImageFormat = 'jpeg' | 'png' | 'webp';

export const IMAGE_FORMAT_EXT: Readonly<Record<TImageFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export const IMAGE_FORMAT_MIME: Readonly<Record<TImageFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const IMAGE_FORMAT_CODEC: Readonly<Record<TImageFormat, string>> = {
  jpeg: 'mjpeg',
  png: 'png',
  webp: 'libwebp',
};

/** `-q:v`'s scale is inverted for mjpeg (2 = best, 31 = worst) vs. webp/most codecs (0-100, higher
 * = better) — a known, documented simplification: this maps the field's 1-100 "higher is better"
 * `quality` directly onto `-q:v` for every format, so a jpeg output's actual visual quality runs
 * backwards from what the field implies. Fixing it needs a real per-codec quality curve, left as a
 * follow-up rather than guessed at here. */
export const imageQualityArgs = (format: TImageFormat, quality: number): readonly string[] =>
  format === 'png' ? [] : ['-q:v', String(quality)];

/** Falls back to jpeg when the input's own probed mime doesn't map cleanly onto one of the three
 * output formats (e.g. an unusual image container) — `format: 'keep'` always needs *some* concrete
 * extension since ffmpeg picks its encoder from the output filename. */
export const imageExtFromMime = (mime: string): string => {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
};
