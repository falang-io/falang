export const CODE_LANGUAGES = ['cpp', 'js', 'ts', 'php', 'rust'] as const;
export type TCodeLanguage = (typeof CODE_LANGUAGES)[number];

export const CODE_FILE_EXTENSIONS: Record<TCodeLanguage, string> = {
  cpp: 'cpp',
  js: 'js',
  ts: 'ts',
  php: 'php',
  rust: 'rs',
};

export const CODE_LANGUAGE_LABELS: Record<TCodeLanguage, string> = {
  cpp: 'C++',
  js: 'JavaScript',
  ts: 'TypeScript',
  php: 'PHP',
  rust: 'Rust',
};

export type TCodeDocumentType =
  | 'simple-code-cpp'
  | 'simple-code-js'
  | 'simple-code-ts'
  | 'simple-code-php'
  | 'simple-code-rust';

/** One desktop-app `DocumentType` per language — mirrors the old app's 5 separate `console_*` project types. */
export const CODE_DOCUMENT_TYPE_BY_LANGUAGE: Record<TCodeLanguage, TCodeDocumentType> = {
  cpp: 'simple-code-cpp',
  js: 'simple-code-js',
  ts: 'simple-code-ts',
  php: 'simple-code-php',
  rust: 'simple-code-rust',
};

export const CODE_LANGUAGE_BY_DOCUMENT_TYPE: Readonly<Record<TCodeDocumentType, TCodeLanguage>> = Object.fromEntries(
  CODE_LANGUAGES.map((language) => [CODE_DOCUMENT_TYPE_BY_LANGUAGE[language], language]),
) as Record<TCodeDocumentType, TCodeLanguage>;

export const isCodeDocumentType = (type: string): type is TCodeDocumentType => type in CODE_LANGUAGE_BY_DOCUMENT_TYPE;
