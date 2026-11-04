/**
 * The Arduino board (`fqbn`) a project is bound to, chosen once in the "New Project…" dialog and
 * persisted to `<projectDir>/falang/config/arduino.json` — see
 * ADR 0032 (private)'s "Decision → 1". Dependency-free (no
 * zod/Electron/React) like the rest of this package, so both `@falang/desktop-app-arduino`'s `main`
 * process and `@falang/desktop-mcp` can import it without pulling in a renderer/Electron runtime.
 */
export interface IArduinoProjectConfig {
  /** An `fqbn` string, e.g. `"arduino:avr:uno"` — not necessarily one of `ARDUINO_BOARDS` below (a
   * user could hand-edit `arduino.json` with a board this catalog doesn't list), so `boardLabel`
   * falls back to the raw string rather than throwing. */
  readonly board: string;
}

export interface IArduinoBoardOption {
  readonly fqbn: string;
  readonly label: string;
  /** The third-party Boards Manager index the board's core needs (`core install --additional-urls`); absent for `arduino:*` cores (ADR 0074 (private) §4). */
  readonly packageIndexUrl?: string;
}

export const ESP32_PACKAGE_INDEX_URL = 'https://espressif.github.io/arduino-esp32/package_esp32_index.json';

/** The board catalog offered by the "New Project…" dialog's board `Select` (ADR 0032 (private)'s own list). */
export const ARDUINO_BOARDS: readonly IArduinoBoardOption[] = [
  { fqbn: 'arduino:avr:uno', label: 'Arduino Uno' },
  { fqbn: 'arduino:avr:nano', label: 'Arduino Nano' },
  { fqbn: 'arduino:avr:nano:cpu=atmega328old', label: 'Arduino Nano (old bootloader)' },
  { fqbn: 'arduino:avr:mega', label: 'Arduino Mega 2560' },
  { fqbn: 'esp32:esp32:esp32', label: 'ESP32 Dev Module', packageIndexUrl: ESP32_PACKAGE_INDEX_URL },
];

export const DEFAULT_BOARD_FQBN = 'arduino:avr:uno';

/** Looks up a human-readable label for an `fqbn`, falling back to the `fqbn` itself for one not in `ARDUINO_BOARDS` (see `IArduinoProjectConfig.board`'s own doc comment). */
export const boardLabel = (fqbn: string): string => ARDUINO_BOARDS.find((board) => board.fqbn === fqbn)?.label ?? fqbn;

/** The core (platform) an `fqbn` needs: its first two `:` segments (`arduino:avr:uno` → `arduino:avr`); `null` for a malformed one. */
export const boardPlatformId = (fqbn: string): string | null => {
  const [vendor, architecture] = fqbn.split(':');
  return vendor && architecture ? `${vendor}:${architecture}` : null;
};

/** The Boards Manager index for a catalogued board's core; `undefined` for `arduino:*` boards and for an `fqbn` outside `ARDUINO_BOARDS` (its core comes from the user's own `arduino-cli.yaml`). */
export const boardPackageIndexUrl = (fqbn: string): string | undefined =>
  ARDUINO_BOARDS.find((board) => board.fqbn === fqbn)?.packageIndexUrl;
