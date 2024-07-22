import { BuildOptions } from 'esbuild'
import * as path from 'path'

console.log(process.env);

const config: BuildOptions = {
  platform: 'browser',
  entryPoints: [
    path.resolve('src/renderer/index.tsx'),
  ],
  inject: ['shim.js'],
  bundle: true,
  target: 'chrome108', // electron version target
  sourcemap: process.env.NODE_ENV !== 'production',
}

export default config
