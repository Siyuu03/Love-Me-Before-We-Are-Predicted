# AT42QT2120 / Pico 网页串口接入

网页只读取 Pico 已有的串口输出，不修改或上传固件。请使用支持 Web Serial 的 Chrome，并通过 `localhost` 打开展览页面。

## 连接

1. 关闭 Arduino IDE 的 Serial Monitor；同一个串口不能同时被 Arduino IDE 和网页占用。
2. 按 `C` 打开设置页。
3. 点击 `CONNECT TOUCH BOARD`；只有这个真实点击会调用系统端口选择框。
4. 选择 Raspberry Pi Pico 对应的串口。
5. 成功后状态显示 `TOUCH BOARD / ONLINE / 115200 BAUD`。
6. `DISCONNECT` 会主动关闭网页端口；`RECONNECT` 只尝试已授权端口，不会自动弹出选择框。

页面刷新后会通过 `navigator.serial.getPorts()` 尝试恢复已授权端口。没有授权端口时保持离线，键盘 A/B 模拟继续工作。

## 支持的现有协议

```text
AT42_READY
A_TOUCH
A_RELEASE
B_TOUCH
B_RELEASE
BOTH_TOUCH
BOTH_RELEASE
STATE A=0 B=0
STATE A=1 B=0
STATE A=0 B=1
STATE A=1 B=1
```

`STATE` 心跳是 A/B 绝对状态。`BOTH_RELEASE` 只表示共同触摸条件结束，不强行把两个通道都清零；截图中的固件会按 `A_RELEASE → BOTH_RELEASE → B_RELEASE` 输出，因此通道边缘和下一条 `STATE` 才是各电极状态的依据。

未知行不会改变触摸状态，也不会使应用停止；原文会保留在 D 键 HUD 的 `LAST SERIAL` 中。

## 当前网页缓冲

- 触摸确认：100 ms
- 第二位参与者等待窗口：5000 ms
- 两侧安静释放：900 ms
- CONTACT 确认：沿用项目当前 350 ms
- 波特率：115200

若显示 `NetworkError` 或 `InvalidStateError`，先确认 Arduino Serial Monitor 已关闭，再点击 `RECONNECT`。拔线或读取失败只会让串口输入离线，不会停止 Three.js、音乐、摄像头或键盘预览。
