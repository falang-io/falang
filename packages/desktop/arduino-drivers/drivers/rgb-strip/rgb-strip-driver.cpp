#include "rgb-strip-driver.h"
#include <Adafruit_NeoPixel.h>

namespace {

constexpr uint8_t kMaxInstances = 4;
Adafruit_NeoPixel* strips[kMaxInstances];
uint8_t stripPins[kMaxInstances];
uint8_t stripCount = 0;

Adafruit_NeoPixel* stripFor(uint8_t pin, uint16_t numLeds) {
  for (uint8_t i = 0; i < stripCount; i++) {
    if (stripPins[i] == pin) return strips[i];
  }
  if (stripCount >= kMaxInstances) return strips[0]; // Beyond kMaxInstances, reuse the first strip rather than allocate unboundedly.
  uint8_t index = stripCount++;
  stripPins[index] = pin;
  strips[index] = new Adafruit_NeoPixel(numLeds, pin, NEO_GRB + NEO_KHZ800);
  strips[index]->begin();
  return strips[index];
}

} // namespace

void rgbstrip_set_pixel_color(uint8_t pin, uint16_t numLeds, uint16_t index, uint8_t r, uint8_t g, uint8_t b) {
  Adafruit_NeoPixel* strip = stripFor(pin, numLeds);
  strip->setPixelColor(index, strip->Color(r, g, b));
}

void rgbstrip_show(uint8_t pin, uint16_t numLeds) {
  stripFor(pin, numLeds)->show();
}

void rgbstrip_init(uint8_t pin, uint16_t numLeds) {
  stripFor(pin, numLeds);
}
