#pragma once
#include <Arduino.h>
#include <Wire.h>

class Pca9548aMux {
 public:
  Pca9548aMux(TwoWire &wire, uint8_t address, uint8_t channel)
      : wire_(wire), address_(address), channel_(channel) {}

  bool select() {
    if (channel_ > 7) return false;
    wire_.beginTransmission(address_);
    wire_.write(static_cast<uint8_t>(1U << channel_));
    return wire_.endTransmission() == 0;
  }

  uint8_t address() const { return address_; }
  uint8_t channel() const { return channel_; }

 private:
  TwoWire &wire_;
  uint8_t address_;
  uint8_t channel_;
};
