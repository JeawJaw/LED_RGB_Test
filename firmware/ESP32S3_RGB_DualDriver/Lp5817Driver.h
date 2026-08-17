#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "Pca9548aMux.h"

class Lp5817Driver {
 public:
  static constexpr uint8_t kAddress = 0x2D;

  Lp5817Driver(TwoWire &wire, Pca9548aMux &mux) : wire_(wire), mux_(mux) {}

  bool begin() {
    delay(2);  // Datasheet: wait at least about 1 ms after VCC rises.
    bool ok = writeRegister(0x00, 0x01);  // CHIP_EN
    ok = writeRegister(0x01, 0x00) && ok; // 25.5 mA maximum (safer default)
    ok = writeRegister(0x14, 0xFF) && ok; // OUT0 dot current
    ok = writeRegister(0x15, 0xFF) && ok; // OUT1 dot current
    ok = writeRegister(0x16, 0xFF) && ok; // OUT2 dot current
    ok = writeRegister(0x02, 0x07) && ok; // Enable OUT0..OUT2
    ok = writeRegister(0x0F, 0x55) && ok; // UPDATE_CMD applies config
    return setRgb(0, 0, 0, 100) && ok;
  }

  bool setRgb(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness) {
    // Default mapping: OUT0=R, OUT1=G, OUT2=B. Swap registers here if needed.
    return writeRegister(0x18, pwm8(red, brightness)) &&
           writeRegister(0x19, pwm8(green, brightness)) &&
           writeRegister(0x1A, pwm8(blue, brightness));
  }

  static uint8_t pwm8(uint8_t value, uint8_t brightness) {
    return static_cast<uint8_t>((static_cast<uint32_t>(value) * brightness + 50U) / 100U);
  }

 private:
  bool writeRegister(uint8_t reg, uint8_t value) {
    if (!mux_.select()) return false;  // Always re-select PCA9548A channel 0.
    wire_.beginTransmission(kAddress);
    wire_.write(reg);
    wire_.write(value);
    return wire_.endTransmission() == 0;
  }

  TwoWire &wire_;
  Pca9548aMux &mux_;
};
