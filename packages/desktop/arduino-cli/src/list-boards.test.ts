import { describe, expect, it, vi } from 'vitest';
import { runArduinoCli } from './run-arduino-cli.js';
import { listBoards } from './list-boards.js';

vi.mock('./run-arduino-cli.js', () => ({ runArduinoCli: vi.fn() }));

const mockedRunArduinoCli = vi.mocked(runArduinoCli);

describe('listBoards', () => {
  it('maps recognized ports to connected boards', async () => {
    const json = JSON.stringify({
      detected_ports: [
        {
          port: { address: '/dev/ttyUSB0' },
          matching_boards: [{ name: 'Arduino Uno', fqbn: 'arduino:avr:uno' }],
        },
      ],
    });
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: json });

    const boards = await listBoards();

    expect(boards).toEqual([{ port: '/dev/ttyUSB0', fqbn: 'arduino:avr:uno', boardName: 'Arduino Uno' }]);
    expect(mockedRunArduinoCli).toHaveBeenCalledWith(['board', 'list', '--format', 'json']);
  });

  it('keeps a port with no recognized board, without fqbn/boardName', async () => {
    const json = JSON.stringify({ detected_ports: [{ port: { address: '/dev/ttyUSB1' } }] });
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: json });

    const boards = await listBoards();

    expect(boards).toEqual([{ port: '/dev/ttyUSB1' }]);
  });

  it('drops a malformed entry with no port address at all', async () => {
    const json = JSON.stringify({
      detected_ports: [{ matching_boards: [{ name: 'Arduino Uno', fqbn: 'arduino:avr:uno' }] }],
    });
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: json });

    const boards = await listBoards();

    expect(boards).toEqual([]);
  });

  it('returns no boards when nothing is detected (real `arduino-cli` shape: no bare top-level array)', async () => {
    const json = JSON.stringify({ detected_ports: [], warnings: ['Error starting discovery: ...'] });
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: json });

    const boards = await listBoards();

    expect(boards).toEqual([]);
  });

  it('throws when arduino-cli itself fails', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: false, output: 'spawn arduino-cli ENOENT' });

    await expect(listBoards()).rejects.toThrow(/spawn arduino-cli ENOENT/);
  });
});
