import * as express from 'express';
import { TTranslation } from '../constants';
import { getBaseLayoutData } from '../util/getBaseLayoutData';

const translations = {
  en: {
    title: 'Articles',
  },
  ru: {
    title: 'Статьи',
  },
} as const satisfies TTranslation;

export const initArticlesPage = (router: express.Router) => {
  router.get('/:lang/articles/', (req, res) => {
    const baseLayoutData = getBaseLayoutData(req, res);
    res.render('articles.nunjucks', {
      ...baseLayoutData,
      menuTab: 'articles',
      ...translations[baseLayoutData.lang],
    });
  });
}
