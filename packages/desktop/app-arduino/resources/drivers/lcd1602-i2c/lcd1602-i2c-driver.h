#pragma once
#include <stdint.h>

/**
 * A minimal `LiquidCrystal_I2C`-style driver for a 16x2 HD44780 character LCD behind a PCF8574 I2C
 * backpack, talked to over the Arduino core's own `Wire` library (bundled, no extra `lib install`
 * needed — unlike `rgb-strip-driver`). Self-contained: no dependency on the real `LiquidCrystal_I2C`
 * third-party library, since its API differs across forks and this only needs the two operations
 * `driver.config.json`'s actions expose (`lcd_clear`/`lcd_print_text`).
 *
 * `lcd_clear`/`lcd_print_text` take no address — the display's I2C address is configured once, via the
 * project's `Devices` document (ADR 0032 (private)), and applied
 * by `lcd_init` below; both functions act on whichever address was last passed to `lcd_init` (or the
 * driver's own default, 0x27, if `lcd_init` was never called at all — see `lcd1602-i2c-driver.cpp`'s
 * `kDefaultAddress`). This mirrors `driver.config.json`'s `device.fields`, which owns the address now.
 */
void lcd_clear();
void lcd_print_text(uint8_t col, uint8_t row, const char* text);

/**
 * The first built-in device (ADR 0032 (private), "Decision →
 * 3") — called once from `setup()`'s compiled prologue when a `Devices` document lists an LCD1602
 * instance, so the display is ready before `loop()` ever runs and every later `lcd_clear`/
 * `lcd_print_text` call knows which address to use.
 */
void lcd_init(uint8_t address);
