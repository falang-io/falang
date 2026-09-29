#pragma once
#include <stdint.h>

/**
 * Thin wrapper over the Arduino core's own `Servo` library (bundled with `arduino:avr`, no extra
 * `arduino-cli lib install` needed — unlike `rgb-strip-driver`, see that driver's own header comment).
 * `servo_set_angle` is a plain per-call function (matching every other driver's calling convention,
 * no separate "attach"/"begin" action the user has to remember) — internally it lazily `attach()`es a
 * `Servo` instance to a pin the first time that pin is used, keyed by pin number in a small static
 * table (see `servo-driver.cpp`).
 */
void servo_set_angle(uint8_t pin, uint8_t angle);
