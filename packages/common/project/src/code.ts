export const CodeLanguages = ["ts", "rust", "cpp", "php", "js"] as const;

export type TCodeLanguage = typeof CodeLanguages[number];

export const LanguageExtendsions: Record<TCodeLanguage, string> = {
  cpp: 'cpp',
  php: 'php',
  rust: 'rs',
  ts: 'ts',
  js: "js",
};
