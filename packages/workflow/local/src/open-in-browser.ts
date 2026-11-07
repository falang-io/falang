import { spawn } from 'node:child_process';

/** Opens `url` in the default browser; silently does nothing when there is none (the URL is printed anyway). */
export const openInBrowser = (url: string): void => {
  let command = { file: 'xdg-open', args: [url] };
  if (process.platform === 'darwin') command = { file: 'open', args: [url] };
  if (process.platform === 'win32') command = { file: 'cmd', args: ['/c', 'start', '', url] };
  try {
    const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore' });
    child.on('error', () => null);
    child.unref();
  } catch {
    // no browser available: the URL is printed anyway
  }
};
