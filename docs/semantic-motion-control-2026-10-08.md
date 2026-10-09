# Live2D 语义、表情与动作同步验收记录

> 2026-10-08 后续修正：根据真实浏览器反馈，自动表情切换已取消。文本分析继续驱动 Speaking/Emphasis 等动作语义，但表情按钮只接受用户明确点击；下方自动 Smile 结果仅作为早期版本历史记录。

日期：2026-10-08

## 控制链路

`文字 → SpeechAnalyzer → EmotionController → TTS → AnalyserNode → MotionController → Live2D 参数叠加`

- 文本规则支持欢迎/介绍、普通说明、重点强调、疑问四类语义。
- 自动表情只在没有人工选择时生效；人工表情具有最高优先级。
- 音频能量继续驱动 `ParamMouthOpenY`，同时以平滑后的能量、节奏起音和强调脉冲驱动低幅头部与上半身变化。
- 停止、播报完成和新一轮播报都会取消旧请求，并统一清理音频节点、嘴型、节奏和动作状态。

## TTS

前端调用仍为 `/api/tts`，密钥仅由 FastAPI 后端读取。

- `TTS_PROVIDER=auto` 且存在 `DASHSCOPE_API_KEY`：阿里云 CosyVoice。
- 默认模型：`cosyvoice-v3-flash`。
- 默认音色：`longanqin_v3`。
- 语速：`1.0`；音调：`1.03`。
- 未配置阿里云密钥：回退到 `zh-CN-XiaoyiNeural`，便于无密钥环境继续验收。
- 服务失败：后端返回 503；页面显示明确错误并把主按钮改为“重新生成”。

## 实测结果

浏览器窗口：1920×1080；真实后端 MP3；实际执行三段文本及 10 轮连续操作。

| 文本 | 自动表情 | 动作状态 | 实测 |
| --- | --- | --- | --- |
| 欢迎体验我们的交互式数字人系统。 | Smile | Speaking | 通过 |
| 本系统支持实时语音播报、表情切换和智能交互。 | Natural | Speaking | 通过 |
| 核心优势在于实时响应和自然表达能力。 | Serious | Emphasis | 通过 |

连续 10 次启动/停止均只保留 1 个活动请求；最终状态为 `activeRequests=0`、`mouth=0`、`speechEnergy=0`、`speechCadence=0`、`emphasisPulse=0`、`motionState=idle`。手动选择 Smile 后播放重点文本，最终仍为 `emotion=smile`、`emotionSource=manual`。

详细机器可读结果：`evidence/2026-10-08-semantic-motion/audit-result.json`。

## 已知限制

- 当前规则是轻量级关键词与标点分析，不进行复杂上下文推理；同一句包含疑问和重点词时优先疑问。
- 音频节奏控制刻意限制在低幅范围，避免与模型原有手臂动作竞争，因此不会模拟逐字手势编排。
- 本机 Docker Desktop 引擎在本轮复测时不可用；前端生产构建、后端独立环境、健康检查、真实 TTS 和浏览器链路均已验证，但本轮没有重新执行容器级构建。
