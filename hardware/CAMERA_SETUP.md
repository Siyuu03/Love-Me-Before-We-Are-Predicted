# 双摄像头现场设置

两路视频只进入本地页面中的两个 `<video>`，不会上传或录制。页面会把 CAM A / CAM B 的稳定 `deviceId` 保存到当前站点的 `localStorage`，不会用设备列表顺序猜测摄像头。

## 接线前检查

1. 关闭 Photo Booth、Zoom、Teams、FaceTime 和其他浏览器摄像头测试页，避免设备被占用。
2. 在 Mac 的 Photo Booth 中分别选择两只 Logitech，确认两只单独都能工作。
3. 打开 `系统设置 → 隐私与安全性 → 相机`，允许当前浏览器或 Codex 使用摄像头。
4. Chrome 使用者同时检查 `chrome://settings/content/camera`，允许网站请求摄像头。
5. 使用本机地址 `http://localhost:5173/`；不要从不受信任的远程地址启动展览页面。

## 页面内设置

1. 运行 `npm run dev -- --host localhost`，打开 `http://localhost:5173/`。
2. 按 `C`，或点击右下角 `SET UP CAMERAS`。
3. 点击 `REQUEST CAMERA ACCESS`。这一步必须由真实点击触发，浏览器才会显示权限请求。
4. 授权后确认 `VIDEO INPUTS` 数量，并分别在 CAMERA A / CAMERA B 下拉菜单选择两只不同的 Logitech。
5. 点击 `SAVE & START OBSERVATION`。
6. 确认面板显示 `CAM A / ONLINE`、`CAM B / ONLINE`，两路预览都有画面，摄像头指示灯亮起。
7. 关闭设置面板，再测试 A / B 触摸。

页面同时提供 `STOP CAMERAS`、`REFRESH DEVICE LIST` 和每路独立的 `RETRY CAMERA A/B`。切换设备前会停止旧 stream；拔出或插回摄像头后，浏览器发出的真实 `devicechange` 会重新枚举并显示原因。切换应用、移动窗口到外接屏幕、打开 DevTools、标签页失焦或重新获得焦点都不会停止或重启摄像头。

Camera Setup 打开期间不会自动刷新设备列表或自动重试，避免下拉框在操作中被重建。只有点击 `REFRESH DEVICE LIST`、`SAVE & START OBSERVATION`、`RETRY CAMERA A/B`，或收到真实 `devicechange` / `track.onended` 时才允许恢复动作。自动恢复采用每路独立的退避间隔：`1s → 2s → 4s → 8s`，最多四次；耗尽后使用对应的 `RETRY CAMERA A/B`，不需要刷新整个网页或重新选择设备。

## 错误含义

- `PERMISSION DENIED`：macOS 或浏览器未授权。
- `NO VIDEO INPUT FOUND`：系统没有枚举到视频输入。
- `CAMERA IN USE BY ANOTHER APP`：摄像头可能被 Photo Booth、Zoom 等占用。
- `SELECTED CAMERA DISCONNECTED`：已保存的设备当前未连接或系统未枚举到。
- `SELECT TWO DIFFERENT CAMERAS`：CAM A / B 选择了同一 deviceId。
- `NotReadableError`：设备存在，但被其他程序占用、USB 供电/带宽不足，或操作系统无法启动该流。
- `TrackEndedError`：已经运行的浏览器 video track 明确结束；此时才会触发该路独立恢复。

如果两只摄像头单独都可用，但同时接入无供电扩展坞后只枚举到一只，这通常是 USB 供电或带宽问题，不是页面权限问题。现场优先把一只 C270 直连 Mac mini、另一只接扩展坞；若必须共用扩展坞，请使用带 PD 供电的型号。页面会显示实际枚举数量，不会把未出现的设备假装成在线。

展览前关闭 Photo Booth、Zoom、Teams、FaceTime 和其他占用摄像头的浏览器标签，按 `C` 检查两路 preview 与健康状态，并至少连续运行 20 分钟。若只有一路异常，先按该路的 `RETRY CAMERA A/B`，不要刷新整个页面。

## 流与检测参数

- 每路请求 `640×480`、理想 `15 FPS`、最高 `20 FPS`。观察框位于舞台边缘，这一规格能显著降低两台 C270 共用 USB 控制器时的带宽与合成压力。
- 两个独立 `<video autoplay muted playsinline>`，不复制为 Three.js 大纹理。
- 为保证双路视频与粒子舞台维持帧率，展览默认不运行视觉检测；视频观察框与触摸锁存仍正常工作。
- 现场性能余量确认后，可用 `VITE_VISION_DETECTION_ENABLED=true` 启用 `FaceDetector`。启用后两路交错检测，每台约 10 FPS。
- 无 `FaceDetector` 或未启用检测时，视频仍工作，观察状态保持 `SEARCHING`，不会伪造人物检测或置信度。

仍可用环境变量预设展览设备，但日常现场配置不需要改代码：

```sh
VITE_CAMERA_A_DEVICE_ID="device-id-for-mirror-a" \
VITE_CAMERA_B_DEVICE_ID="device-id-for-mirror-b" \
npm run dev -- --host localhost
```
