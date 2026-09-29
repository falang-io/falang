#include "hcsr04-driver.h"
#include <Arduino.h>

float hcsr04_read_distance(uint8_t trigPin, uint8_t echoPin) {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long durationUs = pulseIn(echoPin, HIGH, 30000UL);
  if (durationUs == 0) return -1.0f;

  // Speed of sound ~343m/s at room temperature -> ~29.15us per cm round trip, halved for one-way
  // distance -> divide by ~58.
  return durationUs / 58.0f;
}
