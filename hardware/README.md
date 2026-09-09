# MPR121 touch bridge

`mpr121_touch_bridge/mpr121_touch_bridge.ino` 是上传到现场 Arduino / 兼容控制器的独立示例，不能编译进网页项目。

## 默认行为

- 电极 0 → A，电极 1 → B。
- 原始触摸稳定 60 ms 后，仅发送一次 `A_DOWN` / `B_DOWN`。
- 原始释放稳定 220 ms 后，仅发送一次 `A_UP` / `B_UP`。
- 网页协议解析器同时兼容旧消息 `A_TOUCH`、`A_RELEASE`、`B_TOUCH`、`B_RELEASE`。
- 网页端仍负责参与锁存、第二人等待与安静复位；Arduino 只清理电气抖动。

需要安装 Adafruit MPR121 库。示例使用 115200 baud 和默认 I2C 地址 `0x5A`。

## 现场校准

示例中的 `TOUCH_THRESHOLD = 12`、`RELEASE_THRESHOLD = 6` 只是初始尝试值，不是固定答案。两者必须保持分离以形成迟滞。

1. 暂时设置 `DEBUG_TOUCH = true`。
2. 在装置无人触摸、轻触、完整接触和参与者离开时，记录每个电极的 `filtered` 与 `baseline`。
3. 分别校准两个电极；导电材料面积、线长、接地、湿度和观众鞋底都会改变读数。
4. 先保证触摸阈值能可靠确认真实接触，再调整释放阈值和 220 ms 释放去抖；不要只靠盲目增大阈值掩盖布线问题。
5. 正式展出前关闭 DEBUG，避免调试行占用串口。

网页默认再执行 100 ms 触摸确认、220 ms 释放确认、5 秒第二人窗口和体验层锁存，所以少量串口边沿跳动不会令画面反复进出 SOLO。网页的当前参数以 `src/config.ts` 为准。
