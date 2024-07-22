# Friendly Algorithmic Language

Algorithmic framework.

Site: [falang.io](https://falang.io)


Readme in progress..

## Installation

```bash
git clone https://github.com/falang-io/falang.git
cd falang
sudo npm install -g pnpm
pnpm i
```

## Packages list
- desktop
  - [application](./packages/desktop/application) Falang IDE application
- editor
  - [back-fs](./packages/editor/back-fs) Utils for file system on backend
  - [ide](./packages/editor/ide) IDE ui (tabs, directories tree e.t.c.)
  - [infrastructures-all](./packages/editor/infrastructures-all) Library that combine all types of infrastructures
  - [scheme](./packages/editor/scheme) Main scheme library. Contains all logic for scheme editor
  - [styles](./packages/editor/styles) CSS styles
- infrastructure
  - [code](./packages/infrastructure/code) infrastructure for simple code diagrams
  - [logic](./packages/infrastructure/logic) infrastructure for low-code programming
  - [text](./packages/infrastructure/text) infrastructure for text diagrams
- site
  - [backend](./packages/site/backend) Nest.JS application - backend for [app.falang.io](https://app.falang.io)
  - [client-app](./packages/site/client-app) React application - frontend for [app.falang.io](https://app.falang.io)
  - [web](./packages/site/web) Main site applicaiton for [falang.io](https://falang.io)
- common
  - [frontend-core](./packages/common/frontend-core) Base frontend utils
  - [i18n](./packages/common/i18n) Internacionalization library
  - [project](./packages/common/project) Some interfaces for project
  - [registry](./packages/common/registry) Basic library to load packages asynchronously (for code splitting)

## License

Licensed under [Server Side Public License](./packages/LICENSE).
