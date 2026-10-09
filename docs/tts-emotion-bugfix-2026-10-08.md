# 首声延迟与自动微笑问题修复（2026-10-08）

## 根因

1. “你好”触发微笑不是鼠标误操作，而是原 `EmotionController.beginSpeech()` 把语义分析结果直接写入表情按钮状态。
2. 首声延迟的主要部分是 edge-tts 首次 WebSocket 建连与首包等待。旧路径还会继续等待整句 MP3 完整返回，然后才创建 Blob 并播放。

## 修复

- 默认表情固定为 `Natural`，文字语义不再替用户点击 Smile、Serious 或 Doubt。
- 只有用户明确点击表情按钮时才切换，手动表情在播报期间继续保持最高优先级。
- 首句改用 `GET /tts/stream` 渐进式 MP3，收到音频分片即可播放；仍通过 `HTMLAudioElement → AudioContext → AnalyserNode → ParamMouthOpenY` 驱动真实口型。
- 输入框变化后 80 ms 自动预生成首句，后端使用最多 64 条的 LRU 内存缓存。点击播报命中缓存时无需再次连接外部 TTS。
- `/tts/prewarm` 现在先注册后台任务再立即确认；播报请求会等待这次“已受理”确认并复用同文本任务。快速输入后立刻点击不会再让预生成和正式流各自建立一条重复的 TTS 连接。
- 将备用引擎从 `edge-tts 7.2.3` 升级到 `7.2.8`。新版复用进程级 SSL 上下文，避免每次合成都重新加载证书上下文造成的固定冷启动成本。
- 预生成、新流式请求、停止请求共享客户端 ID；新任务会取消同客户端旧预生成、旧合成和旧流。
- 流式播放失败时自动切换现有完整 Blob 路径，并给出明确状态反馈。

## 真实浏览器复测

表情回归文本：`你好，你好，我是大师哥`。下表延迟数据来自预生成命中测试文本：`输入完成后，系统会提前准备好第一句语音。`

| 项目 | 结果 |
|---|---:|
| 点击反馈 | 0.2 ms |
| AudioContext resume | 0.4 ms |
| 真正首声 | 11.5 ms |
| 首次有效口型 | 273.9 ms |
| 点击前表情 | Natural |
| 播放中表情 | Natural |
| 自动切换 Smile | 否 |

无缓存冷启动仍受 edge-tts 首包波动影响，但升级后同机冷流首声由 4993.4 ms 降至 2535.3 ms，减少 49.2%，且已经不再等待完整 MP3。用户正常输入或粘贴后，首句会在点击前后台预生成；本次缓存命中后的首声实测为 11.5 ms。若在 80 ms 内极快点击，正式流会复用刚注册的同文本后台任务，不会取消后重建，也不会双路合成。

手动点击 Smile 后播报，Smile 未被覆盖；恢复 Natural 后也保持 Natural。

缓存命中条件下连续执行 10 次“开始 → 立即停止”，每轮均得到 `activeRequests=0`、`mouth=0`、`speechEnergy=0`、`speechCadence=0`、`emphasisPulse=0`、`motionState=idle`；后端最终 `activeSyntheses=0`。

证据：

- `evidence/2026-10-08-tts-latency/bugfix-audit.json`
- `evidence/2026-10-08-tts-latency/bugfix-natural-instant.png`
