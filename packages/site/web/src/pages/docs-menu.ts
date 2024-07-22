import { TTranslation } from '../constants';

export type IMenuItem = {
  path: string
  translation: TTranslation<'title' | 'keywords' | 'description'>
  children?: IMenuItem[],
}

export const menu: IMenuItem =
{
  path: 'docs',
  translation: {
    en: {
      title: 'About',
      keywords: 'documentation, falang, no-code, visual programming tool',
      description: 'Documentation for Falang, visual programming tool',
    },
    ru: {
      title: 'О проекте',
      keywords: 'документация, falang, фаланг, no-code, инструмент для визуального программирования',
      description: 'Документация для визуального языка Фаланг',
    },
  },
  children: [
    {

      path: 'icons',
      translation: {
        en: {
          title: 'Base icons',
          keywords: 'icons, falang',
          description: 'The list of base Falang icons',
        },
        ru: {
          title: 'Базовые иконы',
          keywords: 'иконы, falang, фаланг',
          description: 'Список базовых икон Falang',
        },
      }
    },
    {

      path: 'basics',
      translation: {
        en: {
          title: 'Basics of working with diagrams',
          keywords: 'icons, diagrams, basics, falang',
          description: 'Basics of working with diagrams: documentation for Falang, visual programming tool',
        },
        ru: {
          title: 'Основы работы со схемами',
          keywords: 'документация, falang, фаланг, no-code, инструмент для визуального программирования',
          description: 'Документация для визуального языка Фаланг',
        },
      }
    },
    {

      path: 'text',
      translation: {
        en: {
          title: 'Text diagrams',
          keywords: 'text, diagrams, falang',
          description: 'Rules for working with text diagrams',
        },
        ru: {
          title: 'Текстовые диаграммы',
          keywords: 'текст, диаграммы, falang',
          description: 'Правила работы с текстовыми диаграммами в Falang',
        },
      }
    },
    {
      path: 'logic',
      translation: {
        en: {
          title: 'Logic constructor',
          keywords: 'logic, constructor',
          description: 'Description of Falang logic constructor',
        },
        ru: {
          title: 'Конструтор логики',
          keywords: 'бизнес логика, конструктор',
          description: 'Описание конструктора логики Falang',
        },
      },
      children: [{
        path: 'examples',
        translation: {
          en: {
            title: 'Examples',
            keywords: 'logic, constructor, icons',
            description: 'Icons of Falang logic constructor',
          },
          ru: {
            title: 'Примеры',
            keywords: 'бизнес логика, иконы',
            description: 'Примеры приложений на Falang',
          },
        }
      }],
      /*children: [
        {
          path: 'icons',
          translation: {
            en: {
              title: 'Icons',
              keywords: 'logic, constructor, icons',
              description: 'Icons of Falang logic constructor',
            },
            ru: {
              title: 'Иконы',
              keywords: 'бизнес логика, иконы',
              description: 'Иконы конструктора логики Falang',
            },
          }
        },
        {

          path: 'math',
          translation: {
            en: {
              title: 'Мathematical expressions',
              keywords: 'logic constructor, math, falang',
              description: 'Мathematical expressions in Falang logic constructor',
            },
            ru: {
              title: 'Математические выражения',
              keywords: 'конструктор логики falang, математические выражения',
              description: 'Математические выражения в конструктрое логики falang',
            },
          }
        },
        {

          path: 'arrays',
          translation: {
            en: {
              title: 'Arrays',
              keywords: 'logic constructor, falang, arrays',
              description: 'Work with arrays in Falang logic constructor',
            },
            ru: {
              title: 'Массивы',
              keywords: 'массивы, конструктор, бизнгес логика, falang',
              description: 'Работа с массивами в конструкторе логики Falang',
            },
          }
        },
        /*{
      
          path: 'strings',
          translation: {
            en: {
              title: '',
              keywords: '',
              description: '',
            },
            ru: {
              title: '',
              keywords: '',
              description: '',
            },
          }
        },
        {

          path: 'objects',
          translation: {
            en: {
              title: 'Objects',
              keywords: 'logic constructor, falang, objects',
              description: 'Work with objects in Falang logic constructor',
            },
            ru: {
              title: 'Объекты',
              keywords: 'конструктор логики, falang, объекты',
              description: 'Работа с объектами в конструкторе логики Falang',
            },
          }
        },
        {

          path: 'api',
          translation: {
            en: {
              title: 'External API',
              keywords: 'logic constructor, falang, api',
              description: 'External API in Falang logic constructor',
            },
            ru: {
              title: 'Внешнее API',
              keywords: 'конструктор логики, api',
              description: 'Внешнее API в конструкторе логики Falang',
            },
          }
        },
        {

          path: 'code-generation',
          translation: {
            en: {
              title: 'Code generation',
              keywords: 'logic constructor, code generation',
              description: 'Code generation in Falang logic constructor',
            },
            ru: {
              title: 'Генерация кода',
              keywords: 'конструктор логики, falang, генерация кода',
              description: 'Генерация кода в конструкторе логики Falang',
            },
          }
        },
      ],*/
    }
  ]
};