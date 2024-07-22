import langConfig from './i18n.json';
import * as i18next from 'i18next'

/*declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'base';
    returnNull: false;
    returnEmptyString: false;
    nsSeparator: ':';
    keySeparator: ':';
    jsonFormat: 'v4';
    allowObjectInHTMLChildren: false;
    resources: typeof langConfig;
  }
};*/

i18next.init({
  debug: !!globalThis.window,
  resources: langConfig as any,
  lng: 'en',
});

export const Languages = ['ru', 'en'];
export type TLanguage = string;

//console.log({langConfig});

export const getLang = (lang: TLanguage) => {
  return {
    t: i18next.getFixedT(lang as any),
  }
};

export { i18next, langConfig };
