#include "lcd1602-parallel-driver.h"
#include <Arduino.h>

namespace {

/** Match `driver.config.json`'s `device.fields` defaults — used only until `lcd_parallel_init` is
 * actually called (e.g. a `lcd_parallel_clear`/`lcd_parallel_print_text` action placed with no
 * `Devices` entry at all). */
constexpr uint8_t kDefaultRs = 8;
constexpr uint8_t kDefaultEn = 9;
constexpr uint8_t kDefaultD4 = 4;
constexpr uint8_t kDefaultD5 = 5;
constexpr uint8_t kDefaultD6 = 6;
constexpr uint8_t kDefaultD7 = 7;

uint8_t currentRs = kDefaultRs;
uint8_t currentEn = kDefaultEn;
uint8_t currentD4 = kDefaultD4;
uint8_t currentD5 = kDefaultD5;
uint8_t currentD6 = kDefaultD6;
uint8_t currentD7 = kDefaultD7;
bool initialized = false;

/** One 4-bit nibble on D4-D7, pulsed through `en` — HD44780's own latch mechanism, same timing
 * `lcd1602-i2c-driver.cpp`'s `writeNibble` uses, just driven straight off GPIO instead of through a
 * PCF8574 expander. `nibble` is expected pre-shifted into bits 4-7 (see `send` below). */
void writeNibble(uint8_t nibble) {
  digitalWrite(currentD4, (nibble & 0x10) ? HIGH : LOW);
  digitalWrite(currentD5, (nibble & 0x20) ? HIGH : LOW);
  digitalWrite(currentD6, (nibble & 0x40) ? HIGH : LOW);
  digitalWrite(currentD7, (nibble & 0x80) ? HIGH : LOW);
  digitalWrite(currentEn, HIGH);
  delayMicroseconds(1);
  digitalWrite(currentEn, LOW);
  delayMicroseconds(50);
}

void send(uint8_t value, uint8_t mode) {
  digitalWrite(currentRs, mode);
  writeNibble(value & 0xF0);
  writeNibble((uint8_t)(value << 4));
}

void command(uint8_t value) {
  send(value, LOW);
}

void data(uint8_t value) {
  send(value, HIGH);
}

void ensureInitialized() {
  if (initialized) return;

  pinMode(currentRs, OUTPUT);
  pinMode(currentEn, OUTPUT);
  pinMode(currentD4, OUTPUT);
  pinMode(currentD5, OUTPUT);
  pinMode(currentD6, OUTPUT);
  pinMode(currentD7, OUTPUT);
  digitalWrite(currentRs, LOW);
  digitalWrite(currentEn, LOW);
  delay(50);

  // HD44780's documented 4-bit-mode init sequence: three forced 8-bit "function set" nibbles, then
  // switch to 4-bit mode — same sequence `lcd1602-i2c-driver.cpp`'s `ensureInitialized` uses.
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

void lcd_parallel_clear() {
  ensureInitialized();
  command(0x01);
  delay(2);
}

void lcd_parallel_init(uint8_t rs, uint8_t en, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7) {
  currentRs = rs;
  currentEn = en;
  currentD4 = d4;
  currentD5 = d5;
  currentD6 = d6;
  currentD7 = d7;
  initialized = false;
  ensureInitialized();
}

constexpr int kColumns = 16;

void lcd_parallel_print_text(int col, uint8_t row, const char* text) {
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
