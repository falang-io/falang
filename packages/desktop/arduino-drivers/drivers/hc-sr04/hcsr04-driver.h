#pragma once
#include <stdint.h>

/**
 * HC-SR04 ultrasonic distance sensor — a trigger pulse, then `pulseIn`-timed echo. See
 * `driver.config.json`'s single `read-distance` action.
 * Returns `-1.0` on timeout (no echo within 30ms — roughly a 5m range ceiling, comfortably beyond the
 * sensor's real ~4m max), the same "one real sentinel value" approach `dht-driver.h` takes with `NAN`.
 */
float hcsr04_read_distance(uint8_t trigPin, uint8_t echoPin);

/** Device setup (called from `setup()` for a `Devices` entry): configures the trigger and echo pins. */
void hcsr04_init(uint8_t trigPin, uint8_t echoPin);
