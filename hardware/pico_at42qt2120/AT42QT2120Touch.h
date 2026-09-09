#pragma once

#include <Arduino.h>
#include <Wire.h>

#ifndef AT42QT2120_MAX_KEYS
#define AT42QT2120_MAX_KEYS 12
#endif

#ifndef AT42QT2120_DEFAULT_ADDR
#define AT42QT2120_DEFAULT_ADDR 0x1C
#endif

// Weak callback declarations à la p5.js (sketch may optionally define them).
void touchPressed(uint8_t key) __attribute__((weak));
void touchReleased(uint8_t key) __attribute__((weak));
void touchChanged(uint8_t key, bool pressed) __attribute__((weak));

class AT42QT2120Touch {
 public:
  using TouchCallback = void (*)(uint8_t key);
  using TouchChangedCallback = void (*)(uint8_t key, bool pressed);

  AT42QT2120Touch();

  bool begin(TwoWire &wire = Wire,
             uint8_t address = AT42QT2120_DEFAULT_ADDR,
             int8_t resetPin = -1,
             int8_t changePin = -1);

  void setWire(TwoWire &wire) { _wire = &wire; }
  void setAddress(uint8_t address) { _address = address; }

  void update();

  bool isPressed(uint8_t key) const;
  uint16_t keyState() const { return _keyState; }

  void onPressed(TouchCallback cb) { _pressedCallback = cb; }
  void onReleased(TouchCallback cb) { _releasedCallback = cb; }
  void onChanged(TouchChangedCallback cb) { _changedCallback = cb; }

  bool calibrate();
  bool resetChip();

  bool readRegister(uint8_t reg, uint8_t &value);
  bool writeRegister(uint8_t reg, uint8_t value);

 private:
  static constexpr uint8_t kRegChipId = 0x00;
  static constexpr uint8_t kRegFirmwareVersion = 0x01;
  static constexpr uint8_t kRegStatus = 0x02;
  static constexpr uint8_t kRegKeyStatusL = 0x03;
  static constexpr uint8_t kRegCommand = 0x56;
  static constexpr uint8_t kCommandCalibrate = 0x01;
  static constexpr uint8_t kCommandReset = 0x02;
  static constexpr uint8_t kExpectedChipId = 0x3E;
  static constexpr unsigned long kResetPulseMs = 2;
  static constexpr unsigned long kBootTimeoutMs = 2500;
  static constexpr unsigned long kBootPollDelayMs = 10;

  TwoWire *_wire;
  uint8_t _address;
  int8_t _resetPin;
  int8_t _changePin;

  uint16_t _keyState;
  uint16_t _prevKeyState;

  TouchCallback _pressedCallback;
  TouchCallback _releasedCallback;
  TouchChangedCallback _changedCallback;

  uint16_t _readKeyState();
  bool _readRegisters(uint8_t reg, uint8_t *buffer, size_t length);
  void _dispatch(uint8_t key, bool pressed);
  bool _writeCommand(uint8_t command);
  bool _waitForReady();
};

inline AT42QT2120Touch::AT42QT2120Touch()
    : _wire(&Wire),
      _address(AT42QT2120_DEFAULT_ADDR),
      _resetPin(-1),
      _changePin(-1),
      _keyState(0),
      _prevKeyState(0),
      _pressedCallback(nullptr),
      _releasedCallback(nullptr),
      _changedCallback(nullptr) {}

inline bool AT42QT2120Touch::begin(TwoWire &wire,
                                   uint8_t address,
                                   int8_t resetPin,
                                   int8_t changePin) {
  _wire = &wire;
  _address = address;
  _resetPin = resetPin;
  _changePin = changePin;

  _wire->begin();

  if (_changePin >= 0) {
    pinMode(_changePin, INPUT_PULLUP);
  }

  if (_resetPin >= 0) {
    pinMode(_resetPin, OUTPUT);
    digitalWrite(_resetPin, LOW);
    delay(kResetPulseMs);
    digitalWrite(_resetPin, HIGH);
  }

  if (!_waitForReady()) {
    return false;
  }

  _prevKeyState = _keyState = _readKeyState();
  return true;
}

inline void AT42QT2120Touch::update() {
  if (_changePin >= 0 && digitalRead(_changePin) != LOW) {
    return;  // CHG is active-low; skip reading if no change.
  }

  const uint16_t state = _readKeyState();
  if (state == _keyState) {
    return;
  }

  _prevKeyState = _keyState;
  _keyState = state;

  const uint16_t changed = _keyState ^ _prevKeyState;
  for (uint8_t key = 0; key < AT42QT2120_MAX_KEYS; ++key) {
    if (changed & (1u << key)) {
      const bool pressed = (_keyState & (1u << key)) != 0;
      _dispatch(key, pressed);
    }
  }
}

inline bool AT42QT2120Touch::isPressed(uint8_t key) const {
  if (key >= AT42QT2120_MAX_KEYS) {
    return false;
  }
  return (_keyState & (1u << key)) != 0;
}

inline bool AT42QT2120Touch::calibrate() { return _writeCommand(kCommandCalibrate); }

inline bool AT42QT2120Touch::resetChip() {
  if (_resetPin >= 0) {
    digitalWrite(_resetPin, LOW);
    delay(5);
    digitalWrite(_resetPin, HIGH);
    delay(5);
    _keyState = _prevKeyState = 0;
    return true;
  }
  return _writeCommand(kCommandReset);
}

inline bool AT42QT2120Touch::readRegister(uint8_t reg, uint8_t &value) {
  return _readRegisters(reg, &value, 1);
}

inline bool AT42QT2120Touch::writeRegister(uint8_t reg, uint8_t value) {
  _wire->beginTransmission(_address);
  _wire->write(reg);
  _wire->write(value);
  return _wire->endTransmission() == 0;
}

inline uint16_t AT42QT2120Touch::_readKeyState() {
  uint8_t buffer[2] = {0, 0};
  if (!_readRegisters(kRegKeyStatusL, buffer, sizeof(buffer))) {
    return _keyState;
  }
  return static_cast<uint16_t>(buffer[0]) |
         (static_cast<uint16_t>(buffer[1]) << 8);
}

inline bool AT42QT2120Touch::_readRegisters(uint8_t reg,
                                            uint8_t *buffer,
                                            size_t length) {
  _wire->beginTransmission(_address);
  _wire->write(reg);
  if (_wire->endTransmission(false) != 0) {
    return false;
  }

  const size_t received = _wire->requestFrom(_address, (uint8_t)length);
  if (received != length) {
    return false;
  }

  for (size_t i = 0; i < length; ++i) {
    buffer[i] = _wire->read();
  }

  return true;
}

inline void AT42QT2120Touch::_dispatch(uint8_t key, bool pressed) {
  if (pressed) {
    if (_pressedCallback) {
      _pressedCallback(key);
    }
    if (touchPressed) {
      touchPressed(key);
    }
  } else {
    if (_releasedCallback) {
      _releasedCallback(key);
    }
    if (touchReleased) {
      touchReleased(key);
    }
  }

  if (_changedCallback) {
    _changedCallback(key, pressed);
  }
  if (touchChanged) {
    touchChanged(key, pressed);
  }
}

inline bool AT42QT2120Touch::_writeCommand(uint8_t command) {
  return writeRegister(kRegCommand, command);
}

inline bool AT42QT2120Touch::_waitForReady() {
  unsigned long start = millis();
  uint8_t chipId = 0;

  while (millis() - start < kBootTimeoutMs) {
    if (readRegister(kRegChipId, chipId) && chipId == kExpectedChipId) {
      return true;
    }
    delay(kBootPollDelayMs);
  }

  return false;
}
