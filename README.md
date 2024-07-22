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
  - [application](./desktop/application) Falang IDE application
- editor
  - [back-fs](./editor/back-fs) Utils for file system on backend
  - [ide](./editor/ide) IDE ui (tabs, directories tree e.t.c.)
  - [infrastructures-all](./editor/infrastructures-all) Library that combine all types of infrastructures
  - [scheme](./editor/scheme) Main scheme library. Contains all logic for scheme editor
  - [styles](./editor/styles) CSS styles
- infrastructure
  - [code](./infrastructure/code) infrastructure for simple code diagrams
  - [logic](./infrastructure/logic) infrastructure for low-code programming
  - [text](./infrastructure/text) infrastructure for text diagrams
- site
  - [backend](./site/backend) Nest.JS application - backend for [app.falang.io](https://app.falang.io)
  - [client-app](./site/client-app) React application - frontend for [app.falang.io](https://app.falang.io)
  - [web](./site/web) Main site applicaiton for [falang.io](https://falang.io)
- common
  - [frontend-core](./common/frontend-core) Base frontend utils
  - [i18n](./common/i18n) Internacionalization library
  - [project](./common/project) Some interfaces for project
  - [registry](./common/registry) Basic library to load packages asynchronously (for code splitting)

## License

Licensed under [Server Side Public License](./LICENSE).
