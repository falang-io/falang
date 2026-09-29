/**
 * Generates `falang_debug.h` — the firmware-side serial monitor a debug build embeds inline (no
 * library install on the host's Arduino toolchain, see ADR 0021 (private) §6). Written against
 * `Serial` only (Arduino's `Stream`-shaped global), so the exact same text can also be compiled for a
 * host with a stdio-backed `Serial` stand-in for the no-hardware protocol test (see
 * `packages/desktop/app-arduino/src/main/arduino-compiler/falang-debug-header.protocol-e2e.test.ts`) —
 * this file only ever emits real Arduino/AVR-portable C, no host awareness leaks in here.
 *
 * Wire protocol (ASCII, newline-terminated, matches `serial-debug-protocol.ts`'s host-side parser):
 * - device → host: `R` (ready, waiting to attach), `P <idx> <depth>` (paused at trace point `idx`,
 *   call depth `depth`), `V <varIdx> <kind> <value>` (`kind` one of `i`/`f`/`b`, one line per
 *   in-scope variable, sent right after `P` while still paused).
 * - host → device: `A` (attach — unblocks `falang_wait_attach()`), `C` (continue), `S` (step over —
 *   resume until the next trace point at depth ≤ the depth stepping started from), `B <idx> 0|1`
 *   (clear/set a breakpoint — accepted both before attach and while paused, so live-toggling works
 *   the same as the Temporal transport's `falang-debug-configure`/live `setBreakpoints`).
 *
 * `falang_trace(idx)` returns whether the site should actually pause — the *generated* per-site call
 * site (not this header) decides what happens in between, since only the compiler knows which
 * variables are in scope there: `if (falang_trace(<idx>)) { falang_var(0, x); ...; falang_pause(); }`
 * (see `arduino-tracer.ts`'s `emitTrace`). This mirrors the ADR's "the generated per-site code calls
 * `falang_var`... then `falang_pause()`" phrasing literally.
 */
export const buildFalangDebugHeader = (traceCount: number): string => {
  const bitmapBytes = Math.max(1, Math.ceil(traceCount / 8));
  return `#ifndef FALANG_DEBUG_H
#define FALANG_DEBUG_H

#include <Arduino.h>

#define FALANG_DEBUG_BP_BYTES ${String(bitmapBytes)}

static uint8_t falang_bp[FALANG_DEBUG_BP_BYTES];
static uint8_t falang_depth = 0;
static bool falang_step_pending = false;
static uint8_t falang_step_depth = 0;

static inline bool falang_bp_get(uint16_t idx) {
  return (falang_bp[idx >> 3] >> (idx & 7)) & 1;
}

static inline void falang_bp_set(uint16_t idx, bool value) {
  if (value) falang_bp[idx >> 3] |= (uint8_t)(1 << (idx & 7));
  else falang_bp[idx >> 3] &= (uint8_t)~(1 << (idx & 7));
}

static inline void falang_var(uint16_t varIdx, int32_t value) {
  Serial.print('V');
  Serial.print(' ');
  Serial.print(varIdx);
  Serial.print(' ');
  Serial.print('i');
  Serial.print(' ');
  Serial.println(value);
}

static inline void falang_var(uint16_t varIdx, float value) {
  Serial.print('V');
  Serial.print(' ');
  Serial.print(varIdx);
  Serial.print(' ');
  Serial.print('f');
  Serial.print(' ');
  Serial.println(value, 6);
}

static inline void falang_var(uint16_t varIdx, bool value) {
  Serial.print('V');
  Serial.print(' ');
  Serial.print(varIdx);
  Serial.print(' ');
  Serial.print('b');
  Serial.print(' ');
  Serial.println(value ? 1 : 0);
}

/** Blocks until a full line (LF- or CR-terminated) is available, dropping it into \`buf\` (NUL-terminated, truncated at \`maxLen - 1\`). This is the only place the protocol blocks the sketch — deliberately, since a breakpoint/step pause and "no host attached yet" are both meant to halt \`loop()\`. */
static inline void falang_read_line(char* buf, uint8_t maxLen) {
  uint8_t i = 0;
  while (true) {
    while (!Serial.available()) {
    }
    char c = (char)Serial.read();
    if (c == '\\n' || c == '\\r') {
      if (i > 0) break;
      continue;
    }
    if (i < maxLen - 1) buf[i++] = c;
  }
  buf[i] = '\\0';
}

/** A tiny unsigned-decimal parser — kept hand-rolled rather than pulling in \`<cstdlib>\`'s \`atoi\`/\`sscanf\` (extra flash on an already tight AVR budget, see the ADR's "Budget caveat"). Stops at the first non-digit. */
static inline uint16_t falang_parse_u16(const char* text, uint8_t* consumed) {
  uint16_t value = 0;
  uint8_t i = 0;
  while (text[i] >= '0' && text[i] <= '9') {
    value = (uint16_t)(value * 10 + (uint16_t)(text[i] - '0'));
    i++;
  }
  if (consumed) *consumed = i;
  return value;
}

/** Applies one already-read command line. \`*resume\`/\`*stepDepth\` are only meaningful for \`C\`/\`S\` — \`falang_pause()\` is the only caller that reads them back out. */
static inline void falang_handle_command(const char* line, bool* resume, uint8_t* stepDepth) {
  if (line[0] == 'C') {
    falang_step_pending = false;
    *resume = true;
  } else if (line[0] == 'S') {
    falang_step_pending = true;
    falang_step_depth = falang_depth;
    *resume = true;
  } else if (line[0] == 'B' && line[1] == ' ') {
    uint8_t consumed = 0;
    uint16_t idx = falang_parse_u16(line + 2, &consumed);
    bool value = line[2 + consumed + 1] == '1';
    falang_bp_set(idx, value);
  }
  (void)stepDepth;
}

/**
 * \`setup()\`'s first call — see the ADR's "turns Uno's 'opening the port resets the board' behaviour
 * into a feature" reasoning: every attach is a clean restart, so breakpoints are always re-sent by the
 * host during this handshake and a breakpoint inside \`setup\` itself can never be missed.
 *
 * Re-sends \`R\` on a bounded spin timeout instead of once — found live, on real Uno hardware
 * (ADR 0021 (private) §6): a single \`R\` right at boot races the host, which only starts
 * listening *after* \`uploadSketch\` returns and the monitor process spawns and opens the port —
 * always strictly later than the reset \`uploadSketch\` itself just triggered. That one-shot \`R\`
 * lands on a port nothing has opened yet and is lost forever, and \`falang_read_line\`'s blocking
 * read then waits for an \`A\` the host will never send (it's still waiting to *hear* \`R\` first) —
 * a permanent deadlock, confirmed directly against real hardware (piped \`arduino-cli monitor\`
 * does not itself reset the board the way the ADR's text assumed; an explicit DTR toggle does).
 * A loop-iteration count stands in for a real timeout (no \`millis()\`/\`delay()\` here — the
 * no-hardware protocol test's \`HardwareSerialStub\` has neither, and \`available()\` there is always
 * true, so this degrades to the old single-\`R\`-then-block behavior in that harness without any
 * stub changes) — not calibrated to a precise interval, just "resend well within a second," so
 * whenever the host actually starts listening, an \`R\` arrives soon after regardless of timing.
 */
static inline void falang_wait_attach() {
  for (uint16_t i = 0; i < FALANG_DEBUG_BP_BYTES; i++) falang_bp[i] = 0;
  falang_depth = 0;
  falang_step_pending = false;
  char line[32];
  uint8_t idx = 0;
  while (true) {
    Serial.println('R');
    for (uint32_t spin = 0; spin < 100000UL; spin++) {
      if (!Serial.available()) continue;
      char c = (char)Serial.read();
      if (c == '\\n' || c == '\\r') {
        if (idx == 0) continue;
        line[idx] = '\\0';
        idx = 0;
        if (line[0] == 'A') return;
        bool ignoredResume = false;
        uint8_t ignoredDepth = 0;
        falang_handle_command(line, &ignoredResume, &ignoredDepth);
        continue;
      }
      if (idx < sizeof(line) - 1) line[idx++] = c;
    }
  }
}

/** Blocks \`loop()\` at a paused trace point until the host sends \`C\`/\`S\`, applying any \`B\` edits it sends meanwhile — a breakpoint toggled mid-pause takes effect on the very next \`falang_trace\` call, live, no rebuild. */
static inline void falang_pause() {
  bool resume = false;
  char line[32];
  while (!resume) {
    falang_read_line(line, sizeof(line));
    falang_handle_command(line, &resume, &falang_step_depth);
  }
}

/** Returns whether the caller should now emit \`falang_var\` calls followed by \`falang_pause()\` — a no-op (single bitmap read + a \`false\` branch) at every other trace point, which is what keeps a debug build's always-instrumented cost negligible when nothing is attached. */
static inline bool falang_trace(uint16_t idx) {
  bool atBreakpoint = falang_bp_get(idx);
  bool atStep = falang_step_pending && falang_depth <= falang_step_depth;
  if (!atBreakpoint && !atStep) return false;
  Serial.print('P');
  Serial.print(' ');
  Serial.print(idx);
  Serial.print(' ');
  Serial.println(falang_depth);
  return true;
}

/** RAII call-depth guard — a compiled function's body declares one of these first (see \`arduino-tracer.ts\`'s \`emitEnter\`), so \`falang_depth\` decrements on every return path (including an early \`return\`) without the compiler needing to insert a matching call at each one. */
class FalangDebugFrame {
public:
  FalangDebugFrame() { falang_depth++; }
  ~FalangDebugFrame() { falang_depth--; }
};

#endif
`;
};
