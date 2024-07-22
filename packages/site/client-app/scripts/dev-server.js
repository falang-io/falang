const esbuild = require('esbuild');
const { prismjsPlugin } = require('esbuild-plugin-prismjs');
const http = require('http');
const path = require('path');
const fs = require('fs');

const host = `localhost`;
const port = 8009;

const bootstrap = async () => {

  // Start esbuild's server
  let ctx = await esbuild.context({
    entryPoints: [path.resolve(__dirname, '../src/index.tsx')],
    outdir: path.resolve(__dirname, '../public/build'),
    sourcemap: true,
    bundle: true,
    splitting: true,
    publicPath: '/build',
    format: 'esm',
    logLevel: 'info',
    tsconfig: './tsconfig.json',
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
    loader: {
      '.svg': 'file',
    },    
  });

  await ctx.watch();

  const { port: esbuildPort } = await ctx.serve({
    servedir: path.resolve(__dirname, '../public'),
    host,
  });
  const { default: open } = await import('open');

  http.createServer((req, res) => {
    let url = req.url || '/';

    if(url !== '/esbuild') {
      console.log(`${req.method} ${req.url}`);
    }

    // It is subpage if it has no points (link to file), and not in 'build' directory
    // also '/esbuild' is path for hot reloading
    const isSubPage = url.includes('/try/') || !url.includes('.') && !url.includes('/build/') && url !== '/esbuild' ;
    const options = {
      hostname: host,
      port: esbuildPort,
      // All subpages rewrites to /index.html
      path: isSubPage ? '/index.html' : url,
      method: req.method,
      headers: req.headers,
    }
    // Forward each incoming request to esbuild
    const proxyReq = http.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    });
    // Forward the body of the request to esbuild
    req.pipe(proxyReq, { end: true })
  }).listen(port, '0.0.0.0', () => {
    console.log(`Server started at http://${host}:${port}`);
    // open default browser
    open(`http://${host}:${port}`);
  });
}

bootstrap();
