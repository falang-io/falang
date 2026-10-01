#pragma once
#include <stdint.h>

/**
 * A minimal 4-bit-mode HD44780 driver for a 16x2 character LCD wired directly to GPIO pins — no PCF8574
 * I2C backpack, unlike `lcd1602-i2c-driver.h`. `RW` is assumed tied to GND (write-only, the near-universal
 * wiring for this use case), so only 6 GPIO pins are needed, not 7.
 *
 * `lcd_parallel_clear`/`lcd_parallel_print_text` take no pins — the six pins the display is wired to
 * (`rs`, `en`, `d4`-`d7`) are configured once, via the project's `Devices` document
 * (ADR 0032 (private)), and applied by `lcd_parallel_init` below;
 * both functions act on whichever pins were last passed to `lcd_parallel_init` (or the driver's own
 * defaults, matching `driver.config.json`'s `device.fields` — see `lcd1602-parallel-driver.cpp`'s
 * `kDefault*` constants — if `lcd_parallel_init` was never called at all).
 *
 * Functions are prefixed `lcd_parallel_*` (not `lcd_*`) so this driver's `.cpp` can coexist in the same
 * sketch directory as `lcd1602-i2c-driver.cpp`'s identically-shaped `lcd_*` functions without a
 * duplicate-symbol clash, in case a project uses both an I2C and a parallel LCD1602 at once.
 */
void lcd_parallel_clear();
void lcd_parallel_print_text(uint8_t col, uint8_t row, const char* text);

/**
 * The built-in device entry point (ADR 0032 (private), "Decision
 * → 3") — called once from `setup()`'s compiled prologue when a `Devices` document lists a parallel
 * LCD1602 instance, so the display is ready before `loop()` ever runs and every later
 * `lcd_parallel_clear`/`lcd_parallel_print_text` call knows which pins to use.
 */
void lcd_parallel_init(uint8_t rs, uint8_t en, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7);
