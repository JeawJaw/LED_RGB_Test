#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include "Pca9548aMux.h"
#include "Ncp5623Driver.h"
#include "Lp5817Driver.h"

// ---------- Change these pins/addresses to match your board ----------
constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;
constexpr uint32_t I2C_FREQUENCY = 400000;
constexpr uint8_t PCA9548A_ADDRESS = 0x70; // A0/A1/A2 = GND
constexpr uint8_t PCA9548A_CHANNEL = 0;
constexpr size_t MAX_JSON_LINE = 256;

enum class LedDriverType { NCP5623, LP5817 };

Pca9548aMux mux(Wire, PCA9548A_ADDRESS, PCA9548A_CHANNEL);
Ncp5623Driver ncp5623(Wire, mux);
Lp5817Driver lp5817(Wire, mux);

char inputLine[MAX_JSON_LINE];
size_t inputLength = 0;
bool pcaReady = false;
bool ncpReady = false;
bool lpReady = false;
LedDriverType activeDriver = LedDriverType::NCP5623;

const char *driverName(LedDriverType driver) {
  return driver == LedDriverType::LP5817 ? "lp5817" : "ncp5623";
}

bool parseDriver(const char *name, LedDriverType &driver) {
  if (strcmp(name, "ncp5623") == 0) { driver = LedDriverType::NCP5623; return true; }
  if (strcmp(name, "lp5817") == 0) { driver = LedDriverType::LP5817; return true; }
  return false;
}

void sendError(const char *message) {
  JsonDocument reply;
  reply["ok"] = false;
  reply["error"] = message;
  serializeJson(reply, Serial);
  Serial.println();
}

void sendStatus(const char *event = nullptr) {
  JsonDocument reply;
  reply["ok"] = true;
  if (event) reply["event"] = event;
  reply["device"] = "esp32-s3-rgb-dual-driver";
  reply["active_driver"] = driverName(activeDriver);
  JsonObject bus = reply["i2c"].to<JsonObject>();
  bus["pca9548a"] = pcaReady;
  bus["pca_address"] = PCA9548A_ADDRESS;
  bus["pca_channel"] = PCA9548A_CHANNEL;
  bus["ncp5623"] = ncpReady;
  bus["ncp_address"] = Ncp5623Driver::kAddress;
  bus["lp5817"] = lpReady;
  bus["lp_address"] = Lp5817Driver::kAddress;
  serializeJson(reply, Serial);
  Serial.println();
}

bool setSelectedDriver(LedDriverType selected, uint8_t red, uint8_t green,
                       uint8_t blue, uint8_t brightness) {
  // Turn the previous driver off when the UI switches driver.
  if (selected != activeDriver) {
    if (activeDriver == LedDriverType::NCP5623 && ncpReady) ncp5623.setRgb(0, 0, 0, 0);
    if (activeDriver == LedDriverType::LP5817 && lpReady) lp5817.setRgb(0, 0, 0, 0);
    activeDriver = selected;
  }

  if (selected == LedDriverType::LP5817) {
    const bool ok = lp5817.setRgb(red, green, blue, brightness);
    lpReady = ok;
    return ok;
  }
  const bool ok = ncp5623.setRgb(red, green, blue, brightness);
  ncpReady = ok;
  return ok;
}

void sendRgbReply(LedDriverType driver, uint8_t red, uint8_t green,
                  uint8_t blue, uint8_t brightness, bool i2cOk) {
  JsonDocument reply;
  reply["ok"] = i2cOk;
  reply["driver"] = driverName(driver);
  reply["r"] = red; reply["g"] = green; reply["b"] = blue;
  reply["brightness"] = brightness;
  reply["pca_channel"] = PCA9548A_CHANNEL;
  JsonObject pwm = reply[driver == LedDriverType::LP5817 ? "pwm8" : "pwm5"].to<JsonObject>();
  if (driver == LedDriverType::LP5817) {
    pwm["r"] = Lp5817Driver::pwm8(red, brightness);
    pwm["g"] = Lp5817Driver::pwm8(green, brightness);
    pwm["b"] = Lp5817Driver::pwm8(blue, brightness);
  } else {
    pwm["r"] = Ncp5623Driver::pwm5(red, brightness);
    pwm["g"] = Ncp5623Driver::pwm5(green, brightness);
    pwm["b"] = Ncp5623Driver::pwm5(blue, brightness);
  }
  if (!i2cOk) reply["error"] = "pca9548a_or_selected_driver_i2c_failed";
  serializeJson(reply, Serial);
  Serial.println();
}

void handleJsonLine(const char *line) {
  JsonDocument request;
  if (deserializeJson(request, line)) { sendError("invalid_json"); return; }

  const char *command = request["cmd"] | "";
  if (strcmp(command, "ping") == 0) { sendStatus(); return; }
  if (strcmp(command, "set_rgb") != 0) { sendError("unknown_command"); return; }

  const int red = request["r"] | -1;
  const int green = request["g"] | -1;
  const int blue = request["b"] | -1;
  const int brightness = request["brightness"] | 100; // backward compatible
  LedDriverType selected;
  if (!parseDriver(request["driver"] | "ncp5623", selected)) { sendError("driver_must_be_ncp5623_or_lp5817"); return; }
  if (red < 0 || red > 255 || green < 0 || green > 255 || blue < 0 || blue > 255) { sendError("rgb_must_be_0_to_255"); return; }
  if (brightness < 0 || brightness > 100) { sendError("brightness_must_be_0_to_100"); return; }

  const bool ok = setSelectedDriver(selected, red, green, blue, brightness);
  pcaReady = ok || mux.select();
  sendRgbReply(selected, red, green, blue, brightness, ok);
}

void readUsbCdc() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\r') continue;
    if (incoming == '\n') {
      if (inputLength > 0) { inputLine[inputLength] = '\0'; handleJsonLine(inputLine); inputLength = 0; }
      continue;
    }
    if (inputLength < MAX_JSON_LINE - 1) inputLine[inputLength++] = incoming;
    else { inputLength = 0; sendError("json_line_too_long"); }
  }
}

void setup() {
  // Arduino IDE: Tools > USB CDC On Boot > Enabled.
  Serial.begin(115200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, I2C_FREQUENCY);
  delay(20);

  pcaReady = mux.select();
  ncpReady = ncp5623.begin(); // false is acceptable when this chip is not populated.
  lpReady = lp5817.begin();   // false is acceptable when this chip is not populated.
  activeDriver = LedDriverType::NCP5623;
  delay(300);
  sendStatus("boot");
}

void loop() {
  readUsbCdc();
  delay(1);
}
