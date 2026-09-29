#pragma once
#include <stdint.h>

/**
 * Bit-banged DHT11/DHT22 single-wire protocol driver — see `driver.config.json` for the two actions
 * (`read-temperature`/`read-humidity`) this contributes to the canvas, and
 * ADR 0023 (private)'s "Implementation notes (Phase B/C)" for the
 * design this and the other four pre-bundled drivers follow.
 *
 * `sensorType`: 0 = DHT11, 1 = DHT22 (matches the `dht`'s `sensorType` field's numeric `select` options).
 * Returns `NAN` (from `<math.h>`, always available on the AVR toolchain) on any protocol/checksum
 * failure — the caller (a `create-var` node) gets a `float`, so `NAN` is a real, comparable sentinel
 * rather than a magic number.
 *
 * Each call performs a fresh full read (no caching) — real DHT sensors want at least ~1-2s between
 * reads and calling `read-temperature`/`read-humidity` back-to-back for the same pin does two separate
 * reads rather than sharing one; accepted as a deliberate MVP restriction, the same class of restraint
 * ADR 0023 (private)'s Phase A pin nodes already applied (see that ADR's "Deliberate MVP
 * restrictions").
 */
float dht_read_temperature(uint8_t pin, uint8_t sensorType);
float dht_read_humidity(uint8_t pin, uint8_t sensorType);
