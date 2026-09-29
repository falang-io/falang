export const getTestEmptyDoc = () => ({
  id: '',
  name: 'function-doc',
  root: {
    id: '',
    name: 'function',
    children: [
      {
        id: '1',
        name: 'function-header',
        data: '',
      },
      {
        id: '2',
        name: 'function-body',
        data: '',
        children: [],
      },
      {
        id: '3',
        name: 'function-footer',
        data: '',
      },
    ],
  },
});
