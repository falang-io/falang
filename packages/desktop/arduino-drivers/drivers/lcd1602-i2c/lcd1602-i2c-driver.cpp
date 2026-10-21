#include "lcd1602-i2c-driver.h"
#include <Arduino.h>
#include <Wire.h>

namespace {

constexpr uint8_t kBacklightBit = 0x08;
constexpr uint8_t kEnableBit = 0x04;
constexpr uint8_t kRegisterSelectBit = 0x01;

/** Matches `driver.config.json`'s `device.fields` default for `address` — used only until `lcd_init` is
 * actually called (e.g. a `lcd_clear`/`lcd_print_text` action placed with no `Devices` entry at all). */
constexpr uint8_t kDefaultAddress = 0x27;

uint8_t currentAddress = kDefaultAddress;
bool initialized = false;

void writeExpander(uint8_t value) {
  Wire.beginTransmission(currentAddress);
  Wire.write(value | kBacklightBit);
  Wire.endTransmission();
}

/** One 4-bit nibble, pulsed through the PCF8574's `E` (enable) line — HD44780's own latch mechanism. */
void writeNibble(uint8_t nibble) {
  writeExpander(nibble);
  writeExpander(nibble | kEnableBit);
  delayMicroseconds(1);
  writeExpander(nibble);
  delayMicroseconds(50);
}

void send(uint8_t value, uint8_t mode) {
  writeNibble((value & 0xF0) | mode);
  writeNibble(((value << 4) & 0xF0) | mode);
}

void command(uint8_t value) {
  send(value, 0);
}

void data(uint8_t value) {
  send(value, kRegisterSelectBit);
}

void ensureInitialized() {
  if (initialized) return;

  Wire.begin();
  delay(50);

  // HD44780's documented 4-bit-mode init sequence: three forced 8-bit "function set" nibbles, then
  // switch to 4-bit mode.
  writeNibble(0x30);
  delay(5);
  writeNibble(0x30);
  delayMicroseconds(150);
  writeNibble(0x30);
  writeNibble(0x20);

  command(0x28); // Function set: 4-bit interface, 2 lines, 5x8 dots.
  command(0x0C); // Display on, cursor off, blink off.
  command(0x06); // Entry mode set: increment cursor, no display shift.
  command(0x01); // Clear display.
  delay(2);

  initialized = true;
}

} // namespace

void lcd_clear() {
  ensureInitialized();
  command(0x01);
  delay(2);
}

void lcd_init(uint8_t address) {
  currentAddress = address;
  initialized = false;
  ensureInitialized();
}

constexpr int kColumns = 16;

void lcd_print_text(int col, uint8_t row, const char* text) {
  ensureInitialized();
  // Clipped to the visible 16 columns instead of wrapping: a negative column skips the text's first
  // characters (scrolling text leaving on the left), nothing is written past column 15 (otherwise the
  // controller keeps going into its invisible 40-character line and then onto the other row).
  while (col < 0 && *text != '\0') {
    text++;
    col++;
  }
  if (col < 0 || col >= kColumns || *text == '\0') return;
  const uint8_t rowOffsets[2] = {0x00, 0x40};
  uint8_t clampedRow = row > 1 ? 1 : row;
  command(0x80 | (col + rowOffsets[clampedRow]));
  for (; col < kColumns && *text != '\0'; col++, text++) data((uint8_t)*text);
}
