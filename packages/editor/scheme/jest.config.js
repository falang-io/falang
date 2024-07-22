/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const path = require('path');
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',  
  transformIgnorePatterns: [
    //'<rootDir>/node_modules/.pnpm/(?!(package-a|@scope\\+pkg-b)@)',
    /* if config file is under '~/packages/lib-a/' */
    `${path.join(
      __dirname,
      '../../..',
    )}/node_modules/.pnpm/(?!(nanoid)@)`,
    /* or using relative pattern to match the second 'node_modules/' in 'node_modules/.pnpm/@scope+pkg-b@x.x.x/node_modules/@scope/pkg-b/' */
    //'node_modules/(?!.pnpm|package-a|@scope/pkg-b)',
  ],
  globals: { "ts-jest": { isolatedModules: true, }, }
};
