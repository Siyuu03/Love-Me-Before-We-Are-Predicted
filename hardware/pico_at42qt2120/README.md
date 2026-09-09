# Exhibition Pico / AT42QT2120 firmware

This folder contains the AT42QT2120 touch firmware currently archived for the physical installation. It is distinct from the MPR121 compatibility example in the parent hardware directory.

## Files

- `Arduino_IDE_Files_Pelagic_Memory_A_Map_That_Breathes.ino` — the exhibition sketch. It configures the AT42QT2120 directly over I2C, debounces two selected keys, emits edge messages, and optionally emits state heartbeats.
- `AT42QT2120Touch.h` — a reusable header-only AT42QT2120 helper retained alongside the sketch. The current exhibition sketch does not include it and instead performs the required register operations directly.

No `.uf2` binary is currently included. Rebuild the sketch for the intended Raspberry Pi Pico-compatible board rather than assuming a precompiled binary matches the installed hardware.

## Pin mapping

| AT42QT2120 signal | Pico pin |
| --- | --- |
| SDA | GP4 |
| SCL | GP5 |
| RESET | GP6 |
| CHANGE | GP7 |

The AT42QT2120 I2C address is `0x1C`; expected chip ID is `0x3E`.

Participant mapping:

- A: KEY11, top socket
- B: KEY0, bottom socket

## Current firmware parameters

- Serial baud rate: 115200
- Touch threshold: 25
- Detection integrator: 8
- Software debounce: 120 ms
- Firmware-level BOTH_TOUCH window: 1500 ms
- Optional heartbeat: disabled by default; when enabled, every 2000 ms

The webpage applies its own interaction stabilization and pairing logic after these firmware events. Do not treat the firmware's 1500 ms `BOTH_TOUCH` message as the complete relationship-state policy.

## Upload and test

1. Install Arduino IDE and Raspberry Pi Pico-compatible board support appropriate to the actual controller.
2. Open the `.ino` file.
3. Confirm the pin mapping above against the installed PCB before powering it.
4. Select the correct Pico board and serial port.
5. Upload the sketch.
6. Open Serial Monitor at 115200 baud only for commissioning.
7. Keep hands away during startup calibration.
8. Confirm `AT42_READY` followed by `STATE A=0 B=0`.
9. Confirm A emits `A_TOUCH` / `A_RELEASE`, B emits `B_TOUCH` / `B_RELEASE`, and paired touches can emit `BOTH_TOUCH` / `BOTH_RELEASE`.
10. Close Serial Monitor before connecting from the webpage because only one process can own the port.

If the board becomes hot or the chip is not detected, disconnect USB power and inspect wiring before retrying.
