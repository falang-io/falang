import * as express from 'express';
import { TTranslation } from '../constants';
import { getBaseLayoutData } from '../util/getBaseLayoutData';
import { IMenuItem, menu } from './docs-menu';

const translations = {
  en: {
    title: 'Documentation',
  },
  ru: {
    title: 'Документация',
  },
} as const satisfies TTranslation;


const initSubPages = (items: IMenuItem[], router: express.Router, parentPathArray: string[] = []) => {
  for(const item of items) {
    initSubPage(item, router, parentPathArray);
  }
};

const initSubPage = (item: IMenuItem, router: express.Router, parentPathArray: string[] = []) => {
  const pagePathArray: string[] = [
    ...parentPathArray,
    item.path,
  ];
  const templatePathArray: string[] = [
    ...parentPathArray,
    item.path,
  ];
  if(item.children) {
    templatePathArray.push('index');
  }
  const pagePath = `/:lang/${pagePathArray.length ? `${pagePathArray.join('/')}/` : ''}`;
  router.get(pagePath, (req, res) => {
    const baseLayoutData = getBaseLayoutData(req, res);
    const templateName = `${templatePathArray.join('/')}.${baseLayoutData.lang}.nunjucks`;
    res.render(templateName, {
      ...baseLayoutData,
      ...item.translation[baseLayoutData.lang],
      menuTab: 'docs',
      docsMenu: menu,
      selectedLevel1: templatePathArray[1] ?? '',
      selectedLevel2: templatePathArray[2] ?? '',
    });
  });
  console.log(`Page initialized: ${pagePath}`);
  if(item.children) {
    initSubPages(item.children, router, pagePathArray);
  }
};

export const initDocsPage = (router: express.Router) => {
  initSubPage(menu, router);
}
