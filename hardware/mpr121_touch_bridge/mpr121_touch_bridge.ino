#include <Wire.h>
#include <Adafruit_MPR121.h>

Adafruit_MPR121 capacitive = Adafruit_MPR121();

constexpr bool DEBUG_TOUCH = false;
constexpr uint8_t ELECTRODE_A = 0;
constexpr uint8_t ELECTRODE_B = 1;
constexpr uint8_t TOUCH_THRESHOLD = 12;
constexpr uint8_t RELEASE_THRESHOLD = 6;
constexpr unsigned long TOUCH_CONFIRM_MS = 60;
constexpr unsigned long RELEASE_DEBOUNCE_MS = 220;
constexpr unsigned long DEBUG_INTERVAL_MS = 120;

struct DebouncedElectrode {
  uint8_t electrode;
  const char* downMessage;
  const char* upMessage;
  bool rawTouched;
  bool stableTouched;
  unsigned long rawChangedAt;
};

DebouncedElectrode channels[] = {
  { ELECTRODE_A, "A_DOWN", "A_UP", false, false, 0 },
  { ELECTRODE_B, "B_DOWN", "B_UP", false, false, 0 },
};

unsigned long lastDebugAt = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {}

  if (!capacitive.begin(0x5A)) {
    Serial.println("MPR121_ERROR");
    while (true) { delay(50); }
  }

  capacitive.setThresholds(TOUCH_THRESHOLD, RELEASE_THRESHOLD);
  const unsigned long now = millis();
  const uint16_t touchedMask = capacitive.touched();
  for (auto &channel : channels) {
    channel.rawTouched = bitRead(touchedMask, channel.electrode);
    channel.stableTouched = channel.rawTouched;
    channel.rawChangedAt = now;
  }
}

void loop() {
  const unsigned long now = millis();
  const uint16_t touchedMask = capacitive.touched();

  for (auto &channel : channels) {
    const bool rawNow = bitRead(touchedMask, channel.electrode);
    if (rawNow != channel.rawTouched) {
      channel.rawTouched = rawNow;
      channel.rawChangedAt = now;
    }

    const unsigned long requiredStableMs = rawNow
      ? TOUCH_CONFIRM_MS
      : RELEASE_DEBOUNCE_MS;
    if (
      rawNow != channel.stableTouched
      && now - channel.rawChangedAt >= requiredStableMs
    ) {
      channel.stableTouched = rawNow;
      Serial.println(rawNow ? channel.downMessage : channel.upMessage);
    }
  }

  if (DEBUG_TOUCH && now - lastDebugAt >= DEBUG_INTERVAL_MS) {
    lastDebugAt = now;
    for (const auto &channel : channels) {
      Serial.print("DEBUG electrode="); Serial.print(channel.electrode);
      Serial.print(" raw="); Serial.print(channel.rawTouched);
      Serial.print(" stable="); Serial.print(channel.stableTouched);
      Serial.print(" filtered="); Serial.print(capacitive.filteredData(channel.electrode));
      Serial.print(" baseline="); Serial.println(capacitive.baselineData(channel.electrode));
    }
  }
}
