#include "servo-driver.h"
#include <Servo.h>

namespace {

constexpr uint8_t kMaxInstances = 8;
Servo falangServos[kMaxInstances];
uint8_t falangServoPins[kMaxInstances];
uint8_t falangServoCount = 0;

Servo& servoFor(uint8_t pin) {
  for (uint8_t i = 0; i < falangServoCount; i++) {
    if (falangServoPins[i] == pin) return falangServos[i];
  }
  // Beyond kMaxInstances, silently reuse the last slot rather than corrupt memory — a real sketch
  // driving more than 8 servos is already an unusual MVP edge case.
  uint8_t index = falangServoCount < kMaxInstances ? falangServoCount++ : (uint8_t)(kMaxInstances - 1);
  falangServoPins[index] = pin;
  falangServos[index].attach(pin);
  return falangServos[index];
}

} // namespace

void servo_set_angle(uint8_t pin, uint8_t angle) {
  servoFor(pin).write(angle);
}

void servo_init(uint8_t pin) {
  servoFor(pin);
}
