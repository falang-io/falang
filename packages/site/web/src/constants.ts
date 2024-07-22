export const Languages = ['ru', 'en'] as const;
export type TLanguage = typeof Languages[number];
export type TTranslation<TKeys extends string = string> = Record<TLanguage, Record<TKeys, string>>;
