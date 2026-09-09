# Hardware and commissioning

## Exhibition hardware

- Portrait-oriented 27-inch Dell display over HDMI
- Two Logitech C270 USB cameras
- Host-computer 3.5 mm audio output and speakers
- Raspberry Pi Pico-compatible controller
- AT42QT2120 capacitive-touch board
- Two conductive electrodes mounted near the fibre structures, isolated from the metal shaft
- USB connection from Pico to the host computer

The repository contains the actual archived AT42QT2120 exhibition sketch. The separate MPR121 sketch is retained only as a compatibility example and must not be described or uploaded as the installed firmware.

## Pico and AT42QT2120 wiring

| Function | Pico pin / AT42 channel |
| --- | --- |
| I2C SDA | GP4 |
| I2C SCL | GP5 |
| AT42 RESET | GP6 |
| AT42 CHANGE | GP7 |
| I2C address | `0x1C` |
| Expected chip ID | `0x3E` |
| Participant A / top socket | KEY11 |
| Participant B / bottom socket | KEY0 |

Disconnect USB power before changing wiring. If the controller or sensor becomes hot, disconnect it immediately and inspect power, ground, and I2C connections.

## Exhibition firmware

Open:

```text
hardware/pico_at42qt2120/Arduino_IDE_Files_Pelagic_Memory_A_Map_That_Breathes.ino
```

Current firmware settings in that file:

- Serial: 115200 baud
- Touch threshold: 25
- Detection integrator: 8
- Software debounce: 120 ms
- Paired edge-event window: 1500 ms
- Optional `STATE` heartbeat: disabled; 2000 ms when enabled

`AT42QT2120Touch.h` is an archived reusable helper. The exhibition `.ino` currently performs the required register operations directly and does not include this header.

No `.uf2` binary is included. The intended Pico board/core must be selected in Arduino IDE and the sketch rebuilt for the installed controller. Record the exact board-core version used for a future release if binary reproducibility is required.

## Upload procedure

1. Install Arduino IDE and Raspberry Pi Pico-compatible board support.
2. Open the exhibition `.ino` file.
3. Verify the physical pin mapping against the table above.
4. Select the actual Pico-compatible board and its serial port.
5. Upload the sketch.
6. Open Serial Monitor at 115200 baud for commissioning only.
7. Keep both touch electrodes clear during startup calibration.
8. Confirm `AT42_READY`, followed by `STATE A=0 B=0`.
9. Touch each side separately and confirm `A_TOUCH` / `A_RELEASE` and `B_TOUCH` / `B_RELEASE`.
10. Confirm paired events may produce `BOTH_TOUCH` / `BOTH_RELEASE`.
11. Close Serial Monitor before opening the website's serial connection; only one process can own the port.

The webpage also accepts legacy `A_DOWN`, `A_UP`, `B_DOWN`, and `B_UP` messages. The current exhibition firmware emits the `*_TOUCH` / `*_RELEASE` protocol above.

## Browser connection

1. Serve the project at `http://localhost:5173/` in Chrome or another Chromium browser with Web Serial.
2. Press `C` to open setup.
3. Click `CONNECT TOUCH BOARD`; the system chooser must be opened by this user action.
4. Select the Pico port and confirm `TOUCH BOARD / ONLINE`.
5. Use A/B keyboard input if the serial board is unavailable.

The browser may reopen a previously authorised port after refresh, but it never automatically opens the system chooser. Port grants and identifiers remain in the browser and are not uploaded to Git.

## Dual-camera commissioning

1. Close Photo Booth, FaceTime, Zoom, Teams, and other camera tabs.
2. In macOS System Settings, grant camera access to the browser.
3. Press `C`, request permission, and refresh the device list.
4. Assign two different C270 device IDs to CAM A and CAM B.
5. Save and start observation; the target constraint is 640×480 at 15 fps per camera.
6. If both cameras share one unpowered hub and one disappears, connect one camera directly and the other through a powered hub.

Camera assignment device IDs are saved only in browser `localStorage`. They must not be copied into committed `.env` files or documentation.

## Troubleshooting

- `AT42_NOT_FOUND`: power down, confirm address and wiring, then retry.
- `AT42_READ_ERROR`: inspect I2C wiring, pull-ups, cable length, and power stability.
- No serial chooser: use a Chromium browser on a secure/local origin and click the page button.
- Port busy: close Arduino Serial Monitor and any second browser tab using Web Serial.
- Touch chatters: check electrode insulation and grounding before changing firmware or webpage thresholds.
- Only one camera opens: close other camera clients, retry only the affected camera, then test USB power/bandwidth.
- Audio is silent: interact with the page once to satisfy autoplay policy and verify the 3.5 mm output device.

More detailed UI procedures are in [`hardware/CAMERA_SETUP.md`](../hardware/CAMERA_SETUP.md), [`hardware/TOUCH_BOARD_SETUP.md`](../hardware/TOUCH_BOARD_SETUP.md), and the [`pico_at42qt2120` README](../hardware/pico_at42qt2120/README.md).
