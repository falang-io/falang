import { BuildOptions } from 'esbuild'
import * as path from 'path'

const config: BuildOptions = {
  platform: 'node',
  entryPoints: [
    path.resolve('src/main/main.ts'),
    path.resolve('src/main/preload.ts'),
  ],
  bundle: true,
  inject: ['shim.js'],
  target: 'node16.15.0', // electron version target
  sourcemap: process.env.NODE_ENV !== 'production',
}

export default config
