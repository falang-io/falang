const esbuild = require('esbuild');
const path = require('path');
const { prismjsPlugin } = require('esbuild-plugin-prismjs');

//./node_modules/.bin/esbuild src/index.tsx --loader:.ttf=file --loader:.woff=file --loader:.woff2=file  --minify --loader:.eot=file --loader:.svg=file --public-path=/ --bundle --format=esm --outdir=build --minify --define:IS_PRODUCTION=true
  // Start esbuild's server\

const bootstrap = async () => {
  try {
    const result = await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../src/index.tsx')],
      outdir: path.resolve(__dirname, '../public/build'),  
      bundle: true,
      splitting: true,
      publicPath: '/build',
      format: 'esm',
      logLevel: 'info',
      tsconfig: './tsconfig.json',
      minify: true,
      loader: {
        '.ttf': 'file',
        '.woff': 'file',
        '.woff2': 'file',
        '.eot': 'file',
        '.svg': 'file',
      },
      define: {
        IS_PRODUCTION: 'true'
      },
      plugins: [
        prismjsPlugin({
          inline: true,
          languages: ['typescript', 'javascript', 'csharp', 'go', 'rust'],
          plugins: [
            'line-highlight',
            'line-numbers',
          ],
          theme: 'okaidia',
          css: true,
        }),
      ],
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

bootstrap();
