#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "Pca9548aMux.h"

class Ncp5623Driver {
 public:
  static constexpr uint8_t kAddress = 0x38;

  Ncp5623Driver(TwoWire &wire, Pca9548aMux &mux) : wire_(wire), mux_(mux) {}

  bool begin() {
    // Maximum 5-bit current step. Change this if your LED/current design requires less.
    return writeCommand(0x20 | 31) && setRgb(0, 0, 0, 100);
  }

  bool setRgb(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness) {
    return writeCommand(0x40 | pwm5(red, brightness)) &&
           writeCommand(0x60 | pwm5(green, brightness)) &&
           writeCommand(0x80 | pwm5(blue, brightness));
  }

  static uint8_t pwm5(uint8_t value, uint8_t brightness) {
    const uint32_t scaled = static_cast<uint32_t>(value) * brightness * 31U;
    return static_cast<uint8_t>((scaled + 12750U) / 25500U);
  }

 private:
  bool writeCommand(uint8_t command) {
    if (!mux_.select()) return false;  // Always re-select PCA9548A channel 0.
    wire_.beginTransmission(kAddress);
    wire_.write(command);
    return wire_.endTransmission() == 0;
  }

  TwoWire &wire_;
  Pca9548aMux &mux_;
};
