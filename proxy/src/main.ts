import { parseTokens } from './auth.js';
import { createProxyServer } from './proxy-server.js';

const parsePorts = (raw: string | undefined): readonly number[] | '*' => {
  const value = (raw ?? '443,80').trim();
  if (value === '*') {
    return '*';
  }
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
};

const tokens = parseTokens(process.env.PROXY_TOKENS);
if (tokens.length === 0) {
  console.error('PROXY_TOKENS is required: set at least one token (comma-separated).');
  process.exit(1);
}

const port = Number(process.env.HTTP_PORT ?? 8080);
const server = createProxyServer({
  tokens,
  allowedPorts: parsePorts(process.env.PROXY_ALLOWED_PORTS),
  exposeStats: process.env.PROXY_EXPOSE_STATS === 'true',
});

server.listen(port, () => {
  console.log(`falang-proxy listening on :${port}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
