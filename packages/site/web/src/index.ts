import express from 'express';
import expressNunjucks from 'express-nunjucks';
import * as path from 'path';
import { getBaseLayoutData } from './util/getBaseLayoutData';
import nunjucks from 'nunjucks';
import { initIndexPage } from './pages/index.page';
import { initDocsPage } from './pages/docs.page';
import { initArticlesPage } from './pages/articles.page';
import { initVideoPage } from './pages/video.page';
import { IMenuItem, menu } from './pages/docs-menu';

const app = express();
const port = 8000;
/*
nunjucks.configure('views', {
  express: app,
  autoescape: true,
});
*/
//app.set('views', path.dirname(__dirname) + '/templates');

nunjucks.configure({
  dev: true,
  watch: true,
});

app.engine('nunjucks', nunjucks.render);
app.set('view engine','nunjucks');
app.set('views', path.dirname(__dirname).concat('/templates'));
app.use(express.static(path.join(path.dirname(__dirname), 'public')));

app.get('/', (req, res) => {
  var lang = req.acceptsLanguages('ru', 'en');
  if(lang === 'ru') {
    res.redirect(301, '/ru/');
  } else {
    res.redirect(301, '/en/');
  }
  res.end();
});

const router = express.Router({ strict: true});
app.use(router);

initIndexPage(router);
initDocsPage(router);
initArticlesPage(router);
initVideoPage(router);

app.get('/robots.txt', (req, res) => {
res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://falang.io/sitemap.xml
`);
});

const url = 'https://falang.io/';

const initSitemapDocsSubpages = (menu: IMenuItem, parent = ''): string[] => {
  const returnValue: string[] = [
    `<url><loc>${url}${parent}${menu.path}/</loc></url>`
  ];
  menu.children?.forEach((subItem) => {
    returnValue.push(...initSitemapDocsSubpages(subItem, `${parent}${menu.path}/`));
  });
  return returnValue;
}

app.get('/sitemap.xml', (req, res) => {
 
  const returnValue: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `<url><loc>${url}en/</loc></url>`,
    ...initSitemapDocsSubpages(menu, 'en/'),
    `<url><loc>${url}ru/</loc></url>`,
    ...initSitemapDocsSubpages(menu, 'ru/'),
  ];

  returnValue.push(...[
    '</urlset>'
  ]);

  res.type('application/xml').send(returnValue.join(''));
});

app.listen(port, () => {
  console.log(`App started on http://localhost:${port}/`);
});
