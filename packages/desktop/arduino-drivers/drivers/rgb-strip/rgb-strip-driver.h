#pragma once
#include <stdint.h>

/**
 * A thin wrapper over the real `Adafruit_NeoPixel` library (WS2812/NeoPixel-family addressable RGB
 * strips) — see ADR 0023 (private)'s "Implementation notes (Phase
 * B/C)" for why this driver depends on the real, widely-used third-party library rather than a
 * hand-rolled bit-bang routine (WS2812's ~1.25us/bit timing needs either inline assembly or carefully
 * cycle-counted C; `Adafruit_NeoPixel` already solves that correctly for every common AVR/ESP board,
 * and this driver's own C++ could not be compile/hardware-verified in this sandbox either way — see
 * that same section).
 *
 * **Requires `arduino-cli lib install "Adafruit NeoPixel"` to be run once before a sketch using this
 * driver will compile** — this app has no automatic per-driver library-install mechanism yet (a
 * `libraries: string[]` field on `driver.config.json`, feeding `arduino-cli lib install` automatically,
 * is a deferred Phase B/C follow-up, see the ADR's "Deferred").
 *
 * `numLeds` is passed on every call (not fixed at some separate "begin" step) since drivers have no
 * init action, matching every other driver here — the first call for a given `pin` lazily constructs
 * and `begin()`s the underlying `Adafruit_NeoPixel` instance using whatever `numLeds` that first call
 * passed; later calls for the same pin with a *different* `numLeds` are **not** supported (the
 * instance keeps its original length) — a deliberate MVP restriction, document only, not enforced at
 * compile time.
 */
void rgbstrip_set_pixel_color(uint8_t pin, uint16_t numLeds, uint16_t index, uint8_t r, uint8_t g, uint8_t b);
void rgbstrip_show(uint8_t pin, uint16_t numLeds);
