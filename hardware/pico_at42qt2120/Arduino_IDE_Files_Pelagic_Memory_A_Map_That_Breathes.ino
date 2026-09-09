#include <Wire.h>

// Goldsmiths Physical Computing 2 PCB 2025-26
// AT42QT2120:
// SDA=GP4, SCL=GP5, RESET=GP6, CHANGE=GP7.

const uint8_t AT42_ADDRESS = 0x1C;
const uint8_t AT42_CHIP_ID = 0x3E;

const uint8_t SDA_PIN = 4;
const uint8_t SCL_PIN = 5;
const uint8_t RESET_PIN = 6;
const uint8_t CHANGE_PIN = 7;

// Current wiring:
// top socket    = KEY11 = participant A
// bottom socket = KEY0  = participant B
const uint8_t A_CHANNEL = 11;
const uint8_t B_CHANNEL = 0;

// AT42QT2120 registers
const uint8_t REG_CHIP_ID = 0x00;
const uint8_t REG_KEY_STATUS = 0x03;
const uint8_t REG_CALIBRATE = 0x06;
const uint8_t REG_DETECTION_INTEGRATOR = 0x0B;

// KEY0–KEY11 thresholds = registers 16–27
const uint8_t REG_THRESHOLD_BASE = 0x10;

// KEY0–KEY11 controls = registers 28–39
const uint8_t REG_KEY_CONTROL_BASE = 0x1C;

// ==================================================
// TOUCH SETTINGS
// ==================================================

// Higher number = lower sensitivity.
// Default is 10.
const uint8_t TOUCH_THRESHOLD = 25;

// Higher number = more stable but slower.
// Default is 4; maximum is 32.
const uint8_t DETECTION_INTEGRATOR = 8;

// Extra software debounce.
const unsigned long SOFTWARE_DEBOUNCE_MS = 120;

// A and B must each produce a new TOUCH within this
// interval before BOTH_TOUCH is accepted.
const unsigned long BOTH_TOUCH_WINDOW_MS = 1500;

// Set true temporarily if you want STATE output
// every two seconds for diagnosis.
const bool PRINT_HEARTBEAT = false;

// ==================================================

bool sensorReady = false;
bool bothStable = false;

unsigned long lastHeartbeat = 0;
unsigned long lastATouchTime = 0;
unsigned long lastBTouchTime = 0;

struct DebouncedInput {
  bool stableState;
  bool candidateState;
  unsigned long candidateSince;
};

DebouncedInput aInput = {
  false,
  false,
  0
};

DebouncedInput bInput = {
  false,
  false,
  0
};

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(AT42_ADDRESS);
  Wire.write(reg);
  Wire.write(value);

  return Wire.endTransmission() == 0;
}

bool readRegisters(
  uint8_t startReg,
  uint8_t *buffer,
  uint8_t count
) {
  Wire.beginTransmission(AT42_ADDRESS);
  Wire.write(startReg);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  uint8_t received =
    Wire.requestFrom(AT42_ADDRESS, count);

  if (received != count) {
    while (Wire.available()) {
      Wire.read();
    }

    return false;
  }

  for (uint8_t i = 0; i < count; i++) {
    buffer[i] = Wire.read();
  }

  return true;
}

bool readTouchMask(uint16_t &mask) {
  uint8_t status[2] = {
    0,
    0
  };

  if (!readRegisters(
        REG_KEY_STATUS,
        status,
        2
      )) {
    return false;
  }

  mask =
    (uint16_t)status[0] |
    ((uint16_t)status[1] << 8);

  mask &= 0x0FFF;

  return true;
}

void turnOledOff() {
  // SSD1306 display-off command.
  Wire.beginTransmission(0x3C);
  Wire.write(0x00);
  Wire.write(0xAE);
  Wire.endTransmission();
}

void resetTouchChip() {
  pinMode(RESET_PIN, OUTPUT);

  digitalWrite(RESET_PIN, HIGH);
  delay(2);

  digitalWrite(RESET_PIN, LOW);
  delay(5);

  digitalWrite(RESET_PIN, HIGH);
  delay(250);
}

bool configureTouchChannels() {
  // Require several consecutive valid readings
  // before accepting a touch or release.
  if (!writeRegister(
        REG_DETECTION_INTEGRATOR,
        DETECTION_INTEGRATOR
      )) {
    return false;
  }

  // Enable only KEY0 and KEY11.
  //
  // Key Control EN bit:
  // 0 = enabled as touch sensor
  // 1 = disabled as touch sensor
  for (uint8_t key = 0; key < 12; key++) {
    bool activeChannel =
      key == A_CHANNEL ||
      key == B_CHANNEL;

    uint8_t controlValue =
      activeChannel ? 0x00 : 0x01;

    if (!writeRegister(
          REG_KEY_CONTROL_BASE + key,
          controlValue
        )) {
      return false;
    }
  }

  // Higher threshold = lower sensitivity.
  if (!writeRegister(
        REG_THRESHOLD_BASE + A_CHANNEL,
        TOUCH_THRESHOLD
      )) {
    return false;
  }

  if (!writeRegister(
        REG_THRESHOLD_BASE + B_CHANNEL,
        TOUCH_THRESHOLD
      )) {
    return false;
  }

  return true;
}

void initialiseDebouncedInput(
  DebouncedInput &input,
  bool initialState
) {
  input.stableState = initialState;
  input.candidateState = initialState;
  input.candidateSince = millis();
}

bool startTouchChip() {
  resetTouchChip();

  uint8_t chipId = 0;

  if (!readRegisters(
        REG_CHIP_ID,
        &chipId,
        1
      )) {
    return false;
  }

  Serial.print("AT42 chip ID: 0x");

  if (chipId < 0x10) {
    Serial.print('0');
  }

  Serial.println(chipId, HEX);

  if (chipId != AT42_CHIP_ID) {
    return false;
  }

  if (!configureTouchChannels()) {
    Serial.println("AT42_CONFIG_ERROR");
    return false;
  }

  Serial.print("Threshold: ");
  Serial.println(TOUCH_THRESHOLD);

  Serial.print("Detection integrator: ");
  Serial.println(DETECTION_INTEGRATOR);

  Serial.print("Both-touch window: ");
  Serial.print(BOTH_TOUCH_WINDOW_MS);
  Serial.println(" ms");

  // Always recalibrate after changing channels
  // or sensitivity settings.
  Serial.println(
    "Calibrating: keep hands away."
  );

  if (!writeRegister(
        REG_CALIBRATE,
        1
      )) {
    return false;
  }

  delay(1000);

  uint16_t initialMask = 0;

  if (!readTouchMask(initialMask)) {
    return false;
  }

  bool initialA =
    (initialMask & (1u << A_CHANNEL)) != 0;

  bool initialB =
    (initialMask & (1u << B_CHANNEL)) != 0;

  initialiseDebouncedInput(
    aInput,
    initialA
  );

  initialiseDebouncedInput(
    bInput,
    initialB
  );

  // A state already active during startup is not
  // accepted as a fresh participant touch.
  lastATouchTime = 0;
  lastBTouchTime = 0;
  bothStable = false;

  return true;
}

bool updateDebouncedInput(
  DebouncedInput &input,
  bool rawState
) {
  unsigned long now = millis();

  // Raw state changed: start a new stability timer.
  if (rawState != input.candidateState) {
    input.candidateState = rawState;
    input.candidateSince = now;
  }

  // Accept the candidate only after it has remained
  // unchanged for the debounce period.
  if (
    input.candidateState != input.stableState &&
    now - input.candidateSince >=
      SOFTWARE_DEBOUNCE_MS
  ) {
    input.stableState =
      input.candidateState;

    return true;
  }

  return false;
}

void printCurrentState() {
  Serial.print("STATE A=");
  Serial.print(
    aInput.stableState ? 1 : 0
  );

  Serial.print(" B=");
  Serial.println(
    bInput.stableState ? 1 : 0
  );
}

void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println();
  Serial.println(
    "===== STABLE AT42 TOUCH TEST ====="
  );

  Serial.println(
    "A = KEY11"
  );

  Serial.println(
    "B = KEY0"
  );

  Wire.setSDA(SDA_PIN);
  Wire.setSCL(SCL_PIN);
  Wire.begin();
  Wire.setClock(100000);

  // CHANGE is active-low and open-drain.
  pinMode(
    CHANGE_PIN,
    INPUT_PULLUP
  );

  turnOledOff();

  sensorReady =
    startTouchChip();

  if (!sensorReady) {
    Serial.println(
      "AT42_NOT_FOUND"
    );

    Serial.println(
      "Check board switch and wiring."
    );

    Serial.println(
      "Unplug USB if the board becomes hot."
    );
  } else {
    Serial.println(
      "AT42_READY"
    );

    printCurrentState();
  }

  Serial.println(
    "================================="
  );
}

void loop() {
  if (!sensorReady) {
    Serial.println(
      "AT42_NOT_FOUND"
    );

    delay(1000);
    return;
  }

  uint16_t currentMask = 0;

  if (!readTouchMask(currentMask)) {
    Serial.println(
      "AT42_READ_ERROR"
    );

    delay(100);
    return;
  }

  bool rawA =
    (currentMask & (1u << A_CHANNEL)) != 0;

  bool rawB =
    (currentMask & (1u << B_CHANNEL)) != 0;

  bool aChanged =
    updateDebouncedInput(
      aInput,
      rawA
    );

  bool bChanged =
    updateDebouncedInput(
      bInput,
      rawB
    );

  // Record only a genuinely new, debounced A touch.
  if (aChanged) {
    if (aInput.stableState) {
      lastATouchTime = millis();
    } else {
      lastATouchTime = 0;
    }

    Serial.println(
      aInput.stableState
        ? "A_TOUCH"
        : "A_RELEASE"
    );
  }

  // Record only a genuinely new, debounced B touch.
  if (bChanged) {
    if (bInput.stableState) {
      lastBTouchTime = millis();
    } else {
      lastBTouchTime = 0;
    }

    Serial.println(
      bInput.stableState
        ? "B_TOUCH"
        : "B_RELEASE"
    );
  }

  bool bothNow = false;

  // BOTH_TOUCH is accepted only if:
  // 1. A is currently touched;
  // 2. B is currently touched;
  // 3. both produced a new touch event;
  // 4. the two new events occurred within 1.5 s.
  if (
    aInput.stableState &&
    bInput.stableState &&
    lastATouchTime != 0 &&
    lastBTouchTime != 0
  ) {
    unsigned long newerTime =
      lastATouchTime > lastBTouchTime
        ? lastATouchTime
        : lastBTouchTime;

    unsigned long olderTime =
      lastATouchTime < lastBTouchTime
        ? lastATouchTime
        : lastBTouchTime;

    unsigned long timeDifference =
      newerTime - olderTime;

    bothNow =
      timeDifference <=
      BOTH_TOUCH_WINDOW_MS;
  }

  if (bothNow != bothStable) {
    bothStable = bothNow;

    Serial.println(
      bothStable
        ? "BOTH_TOUCH"
        : "BOTH_RELEASE"
    );
  }

  // Optional diagnostic heartbeat.
  if (
    PRINT_HEARTBEAT &&
    millis() - lastHeartbeat >= 2000
  ) {
    lastHeartbeat = millis();
    printCurrentState();
  }

  delay(15);
}