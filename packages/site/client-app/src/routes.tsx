import React from 'react'
import { runInAction } from 'mobx';
import { Route, RoutesConfig } from 'mobx-router';

import { NotFoundComponent } from './domains/content/404/cmp/NotFound.cmp';
import { HomeComponent } from './domains/content/home/cmp/Home.cmp';
import { UserActivate } from './domains/user/activate/cmp/UserActivate.cmp';
import { ResetPasswordComplete } from './domains/user/reset-password/cmp/ResetPasswordComplete.cmp';
import { UserSettings } from './domains/user/settings/cmp/UserSettings.cmp';
import { EditorComponent } from './domains/editor/Editor.cmp';
import { DocumentListComponent } from './domains/document/list/cmp/DocumentsList.cmp';

import { RootStore } from './domains/core/store/Root.store';
import { TryPageComponent } from './domains/try-page/TryPage.cmp';
import { ExamplesPageComponent } from './domains/examples/Examples.cmp';
import { MyDocumentListComponent } from './domains/document/list/cmp/MyDocumentsList.cmp';

export const getRoutes = (root: RootStore): RoutesConfig<RootStore> => {
  return {
    home: new Route<RootStore>({
      path: '/',
      component: <MyDocumentListComponent root={root} />,
      onEnter: () => root.documentsList.load('my'),
    }),
    viewDocument: new Route<RootStore, { id: string }>({
      path: '/documents/view/:id',
      component: <EditorComponent root={root} />,
      onEnter: (_, { id }) => root.documentEditorPage.load(id, 'view'),
      beforeExit: () => root.documentEditorPage.unload(),
      onParamsChange : (_, { id}) => root.documentEditorPage.load(id, 'view'),
    }),
    editDocument: new Route<RootStore, { id: string }>({
      path: '/documents/edit/:id',
      component: <EditorComponent root={root} />,
      onEnter: (_, { id }) => {root.documentEditorPage.load(id, 'edit')},
      beforeExit: () => root.documentEditorPage.unload(),
      onParamsChange : (_, { id}) => root.documentEditorPage.load(id, 'edit'),
    }),
    try: new Route<RootStore>({
      path: '/try',
      onEnter: () => { root.tryPage.load() },
      onExit: () => { root.tryPage.unload() },
      component: <TryPageComponent page={root.tryPage} />
    }),
    myDocuments: new Route<RootStore>({
      path: '/documents/my',
      component: <DocumentListComponent root={root} />,
      onEnter: () => root.documentsList.load('my'),
    }),
    sharedDocuments: new Route<RootStore>({
      path: '/documents/shared',
      component: <DocumentListComponent root={root} />,
      onEnter: () => root.documentsList.load('shared'),
    }),
    userSettings: new Route<RootStore>({
      path: '/me/settings',
      component: <UserSettings root={root} />,
      //onEnter: () => root.onPageLoaded(),
    }),
    userRegistrationActivate: new Route<RootStore, { code: string }>({
      path: '/user/registration/activate/:code',
      component: <UserActivate root={root} />,
      onEnter: (_, { code }) => runInAction(() => {
        root.activationCode = code;
      }),
    }),
    resetPasswordComplete: new Route<RootStore, { code: string }>({
      path: '/reset-password-complete/:code',
      component: <ResetPasswordComplete root={root} />,
      onEnter: (_, { code }) => runInAction(() => {
        root.activationCode = code;
      }),
    }),
    exampleRoute: new Route<RootStore, { example: string }>({
      path: '/examples/:example',
      component: <ExamplesPageComponent root={root} />,
      onEnter: (_, { example }) => runInAction(() => {
        root.examplesPage.load(example);
      }),
      onExit: () => {
        root.examplesPage.unload();
      }
    }),
    catchAll: new Route({path: '/:unknown_url', component: <NotFoundComponent root={root} />})
    /*userProfile: new Route<RootStore, {
      username: string;
      tab?: string;
    }>({
      path: '/profile/:username/:tab',
      component: <UserProfile />,
      onEnter: (_, { username, tab }) => {
      },
      beforeExit: () => {
      },
      onParamsChange: (route, params) => {
      }
    }),
    gallery: new Route<RootStore, any, any>({
      path: '/gallery',
      component: <Gallery />,
      beforeExit: () => {
        const result = window.confirm('Are you sure you want to leave the gallery?');
        return result;
      },
      onEnter: (route, params, store, queryParams) => {
      }
    }),
    document: new Route<RootStore, {}, { id: number }>({
      path: '/document/:id',
      component: <Document />,
      beforeEnter: (route, params, store) => {
        const userIsLoggedIn = store.app.user;
        if (!userIsLoggedIn) {
          alert('Only logged in users can enter this route!');
          return false;
        }
      },
      onEnter: (route, params) => {
      }
    }),
    book: new Route<RootStore, {}, {
      id: string,
      page: string,
    }>({
      path: '/book/:id/page/:page',
      component: <Book />,
      onEnter: (route, params, store) => {
        store.app.setTitle(route.title);
      }
    })*/
  };
};