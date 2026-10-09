# TTS 首声延迟优化与验收记录（2026-10-08）

## 结论

本轮在现有 Live2D、语义表情、动作状态机和真实音频口型链路上做增量优化，没有更换模型、重做页面或修改 Docker 总体结构。

长文本不再整段合成完才开始播放，而是按中文句号、问号、感叹号、分号和换行分句。第一句立即请求；第一句拿到后开始播放，同时只预取下一句，避免并发请求争抢 TTS 服务。每句仍通过同一个 `HTMLAudioElement → AudioContext → AnalyserNode → ParamMouthOpenY` 链路播放和驱动口型。

## 精确时间线

浏览器为 Codex In-app Browser；后端为本机 FastAPI；实际提供者为 `edge-tts / zh-CN-XiaoyiNeural`。单位均为毫秒，相对点击时刻。

| 阶段 | 长文本首句 | 短文本 |
|---|---:|---:|
| 点击按钮 | 0.0 | 0.0 |
| “正在生成语音”反馈可见 | 0.3 | 0.2 |
| 前端发起 `/api/tts` | 0.4 | 0.3 |
| 请求到达后端 | 约 14.1 | 约 11.2 |
| TTS 返回首个音频数据 | 2993.1 | 4172.0 |
| 后端完整取得 MP3 | 3784.8 | 4791.1 |
| 浏览器收到响应头 | 3791.8 | 4823.8 |
| Blob 创建完成 | 3792.6 | 4824.9 |
| AudioContext resume 完成 | 1.5 | 0.6 |
| 调用 `audio.play()` | 3795.3 | 4825.9 |
| `playing` 事件（真实首声） | 3799.6 | 4831.5 |
| 首次有效口型（阈值 0.03） | 4043.8 | 4987.8 |

浏览器本地的 Blob、解码/播放调用与 AudioContext 不是主要瓶颈；首声前绝大多数时间消耗在外部 TTS 首包与后端等待完整 MP3。网络到本机后端仅约 11–14 ms，Blob 仅 0.8–1.1 ms，`play()` 到 `playing` 仅 4–6 ms。

## 优化前后对比

同一 5 句长文本，优化前等价路径（整段提交并等待完整 MP3）实测：

- 后端首包：4680.1 ms
- 后端完整音频：6791.7 ms
- HTTP 整体完成：6932.4 ms

优化后首句优先路径实测：

- 首声：3799.6 ms
- 首次有效口型：4043.8 ms
- 5 句完整播放：33252.8 ms

以“整段 HTTP 完成”对比“首句真实首声”，代表性样本从 6932.4 ms 降到 3799.6 ms，减少 3132.8 ms（45.2%）。由于 edge-tts 是外部回退服务，同一短句复测的首声曾在 3.80–9.60 秒之间波动，因此该百分比仅代表本次同机实测，不应视为服务等级承诺。

## 取消、互斥和错误处理

- 每次新播报先递增会话 ID、取消全部旧 `AbortController`、停止当前音频、撤销对象 URL 并清空队列。
- 前端为每个页面实例生成客户端 ID；新 `/tts` 请求会在后端取消同客户端旧合成，停止按钮还会调用 `/tts/cancel`。已进入合成的旧请求实测返回 HTTP 499，未到达后端的请求由 `AbortController` 截断。
- 只预取下一句，禁止多路音频播放；句间按队列串行衔接。
- 停止按钮从请求开始即启用，可在“正在生成”阶段取消。
- 连续 10 次“开始 → 立即停止”后，每轮均为：`activeRequests=0`、`mouth=0`、`speechEnergy=0`、`speechCadence=0`、`emphasisPulse=0`、`motionState=idle`。
- HTTP `/api/tts` 非流式方案仍是当前生产回退；失败时页面展示明确错误，不会残留播放或口型状态。

## CosyVoice 流式评估

阿里云官方文档确认 CosyVoice 支持 WebSocket 双向流式输入/输出、二进制音频分片、任务取消和连接复用；官方还建议通过预连接对象池减少首包延迟。当前项目的 `SpeechSynthesizer.call()` 是阻塞式完整音频返回，尚未接入回调分片或浏览器流式播放器。

本轮没有真实 `DASHSCOPE_API_KEY`，因此没有把未经端到端验证的 WebSocket 路径设为默认。下一步应在服务端保留密钥和 WebSocket 连接池，通过受控流式端点向浏览器发送 PCM/MP3 分片，并用 `MediaSource` 或 AudioWorklet 接入现有 AnalyserNode；任何失败仍回落到当前分句 `/api/tts`。

官方参考：

- https://www.alibabacloud.com/help/en/model-studio/realtime-tts-user-guide
- https://www.alibabacloud.com/help/en/model-studio/cosyvoice-websocket-api
- https://www.alibabacloud.com/help/en/model-studio/cosyvoice-python-sdk

## 证据

- `evidence/2026-10-08-tts-latency/audit-result.json`
- `evidence/2026-10-08-tts-latency/browser-loading-feedback.png`
- `evidence/2026-10-08-tts-latency/browser-long-first-mouth.png`
- `evidence/2026-10-08-tts-latency/browser-short-first-mouth.png`
- `evidence/2026-10-08-tts-latency/browser-stop-after-10.png`
- `evidence/2026-10-08-tts-latency/backend-cancel.log`
