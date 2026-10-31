import { defineConfig } from 'electron-vite';

// Workspace `@falang/*` packages publish raw TypeScript (see app-sketch's config for the long version): they must be
// bundled into `out/main` instead of being left as bare imports Node cannot resolve.
const workspacePackages = ['@falang/workflow-client-common'];

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  // The renderer is only the plain splash page: no framework.
  renderer: {},
});
