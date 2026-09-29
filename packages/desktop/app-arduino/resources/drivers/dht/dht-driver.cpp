#include "dht-driver.h"
#include <Arduino.h>
#include <math.h>

namespace {

bool dhtReadRaw(uint8_t pin, uint8_t data[5]) {
  for (uint8_t i = 0; i < 5; i++) data[i] = 0;

  // Start signal: host pulls the line low for >=18ms (works for both DHT11 and DHT22), then
  // releases it and lets the sensor's own pull-up take over.
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(18);
  digitalWrite(pin, HIGH);
  delayMicroseconds(30);
  pinMode(pin, INPUT_PULLUP);

  // Sensor's own response: ~80us low, ~80us high.
  if (pulseIn(pin, LOW, 1000) == 0) return false;
  if (pulseIn(pin, HIGH, 1000) == 0) return false;

  // 40 data bits, each a ~50us low phase followed by a high phase whose length encodes the bit
  // (~26-28us = 0, ~70us = 1).
  for (uint8_t i = 0; i < 40; i++) {
    if (pulseIn(pin, LOW, 1000) == 0) return false;
    unsigned long highLength = pulseIn(pin, HIGH, 1000);
    if (highLength == 0) return false;
    data[i / 8] <<= 1;
    if (highLength > 40) data[i / 8] |= 1;
  }

  uint8_t checksum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);
  return checksum == data[4];
}

} // namespace

float dht_read_temperature(uint8_t pin, uint8_t sensorType) {
  uint8_t data[5];
  if (!dhtReadRaw(pin, data)) return NAN;

  if (sensorType == 0) {
    // DHT11: integer degrees C in data[2] (data[3] is a decimal fraction on some clones, ignored here
    // — matches the classic DHT11 datasheet's integer-only resolution).
    return (float)data[2];
  }

  // DHT22: 16-bit temperature in tenths of a degree C, data[2]'s top bit is the sign.
  int16_t raw = ((int16_t)(data[2] & 0x7F) << 8) | data[3];
  float celsius = raw / 10.0f;
  return (data[2] & 0x80) ? -celsius : celsius;
}

float dht_read_humidity(uint8_t pin, uint8_t sensorType) {
  uint8_t data[5];
  if (!dhtReadRaw(pin, data)) return NAN;

  if (sensorType == 0) return (float)data[0]; // DHT11: integer %RH.
  return (((uint16_t)data[0] << 8) | data[1]) / 10.0f; // DHT22: tenths of a %RH.
}
