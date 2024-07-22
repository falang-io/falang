import * as express from 'express';
import { TTranslation } from '../constants';
import { getBaseLayoutData } from '../util/getBaseLayoutData';

const translations = {
  en: {
    title: 'Friendly algorithmic language',
  },
  ru: {
    title: 'Дружелюбный алгоритмический язык программирования',
  },
} as const satisfies TTranslation;

export const initIndexPage = (router: express.Router) => {
  router.get('/:lang/', (req, res) => {
    const baseLayoutData = getBaseLayoutData(req, res);
    res.render('index.nunjucks', {
      ...baseLayoutData,
      ...translations[baseLayoutData.lang],
      menuTab: 'index',
    });
  });
}