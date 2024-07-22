import { TLanguage } from '../constants'
import express from 'express';
import { i18n } from '../i18n';

export interface IBaseLayoutData extends Record<string, unknown> {
  lang: TLanguage,
  titlePostfix: string,
}

export const getBaseLayoutData = (req: express.Request, res: express.Response): IBaseLayoutData => {
  let lang: TLanguage;
  if(req.url.startsWith('/en/')) {
    lang = 'en';
  } else if (req.url.startsWith('/ru/')) {
    lang = 'ru';
  } else {
    res.statusCode = 404;
    res.send('Not found');
    throw new Error(`URL ${req.url} not found`);
  }
  const nextLang: TLanguage = lang === 'en' ? 'ru' : 'en';
  const nextLangUrl = `/${nextLang}${req.url.substring(3)}`;
  return {
    lang,
    titlePostfix: lang === 'en' ? 'Falang, visual programming tool' : 'Фаланг, инструмент для визуального программирования',
    nextLangUrl,
    i18n: i18n[lang],
  }
}