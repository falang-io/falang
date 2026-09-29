export type TAudioFormat = 'mp3' | 'aac' | 'wav' | 'ogg';

export const AUDIO_FORMAT_CODEC: Readonly<Record<TAudioFormat, string>> = {
  mp3: 'libmp3lame',
  aac: 'aac',
  wav: 'pcm_s16le',
  ogg: 'libvorbis',
};

export const AUDIO_FORMAT_MIME: Readonly<Record<TAudioFormat, string>> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export const AUDIO_FORMAT_EXT: Readonly<Record<TAudioFormat, string>> = {
  mp3: 'mp3',
  aac: 'aac',
  wav: 'wav',
  ogg: 'ogg',
};
