import * as express from 'express';
import { TTranslation } from '../constants';
import { getBaseLayoutData } from '../util/getBaseLayoutData';

const translations = {
  en: {
    title: 'Video',
  },
  ru: {
    title: 'Видео',
  },
} as const satisfies TTranslation;

export const initVideoPage = (router: express.Router) => {
  router.get('/:lang/video/', (req, res) => {
    const baseLayoutData = getBaseLayoutData(req, res);
    res.render('video.nunjucks', {
      ...baseLayoutData,
      ...translations[baseLayoutData.lang],
      menuTab: 'video'
    });
  });
}
