# 交互式 Live2D 数字人

这是用于中文课程或产品讲解的实时数字人 Web 应用。正式前端是 `live2d-web/`：Haru Receptionist 通过 Cubism SDK for Web 实时渲染，支持自然待机、四种表情、强度调节、真实中文 TTS、音频能量口型、立即停止、改文重播、请求取消和错误恢复。旧 `frontend/` 仅保留为历史代码，不参与正式构建或运行。

> Live2D 署名：This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author’s sole discretion.

## 正式架构

- `live2d-web/`：Vite + TypeScript + Live2D Cubism SDK for Web；生产构建由 Nginx 提供。
- `backend/`：FastAPI；服务端代理阿里云 CosyVoice，并在未配置密钥时回退到 `edge-tts`。
- `docker-compose.yml`：只把 `live2d-web` 作为正式前端，对外地址为 `http://127.0.0.1:8080`。
- Nginx 将 `/api/` 代理到 `backend:8000`，将 `/health` 代理到后端健康检查。
- 音频链路保持为 `HTMLAudioElement → AudioContext → AnalyserNode → ParamMouthOpenY`。语音能量同时驱动低幅点头、身体节奏和强调动作，不覆盖原模型手部动作。

## 获取受限 Live2D 资源

仓库策略是：应用源码可以公开；Haru 的模型二进制/纹理/动作及专有 Cubism Core 不直接提交到公开仓库。首次构建前：

1. 从 [Haru Receptionist 官方页面](https://www.live2d.com/en/learn/sample/haru-receptionist/) 下载官方样例并接受对应条款。
2. 将运行时目录复制为 `live2d-web/public/Resources/haru_greeter_t05/`，目录中应包含 `.moc3`、`.model3.json`、`.physics3.json`、`.pose3.json`、`motion/` 和两张 2048 PNG。
3. 从 [Cubism SDK for Web 官方下载页](https://www.live2d.com/en/sdk/download/web/) 获取 SDK，把其中的 `Core/live2dcubismcore.js` 复制到 `live2d-web/public/Core/live2dcubismcore.js`。
4. 在 `live2d-web` 运行 `npm ci && npm run assets:prepare && npm run assets:verify`。`assets:prepare` 从官方两张 2048 PNG 生成本项目使用的 1024 PNG 与预乘 Alpha RGBA gzip，并更新纹理引用；`assets:verify` 检查模型、两张纹理、Core 和 27 个动作文件。

当前本地验收资源的关键 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `Core/live2dcubismcore.js` | `3BA426CC788D74F276598E98FE97983214F2A95758B48DAFB1E606D041DB1BA7` |
| `haru_greeter_t05.moc3` | `597571191064A12FFE592BCB5FADE586EF5876BBBCF78905C348A78A0991432A` |
| `texture_00.rgba.gz` | `6E6AFF3A70CFCCDBE376F32026B1BF59782295154BFF09D9D7510A22E10865B5` |
| `texture_01.rgba.gz` | `D1147F30AF966A6AAE692798D05201C0ED81832240227D7C33A0128FDB938CF1` |

以上校验和用于辨识本次本地验收副本，不表示允许将文件重新分发。完整核查见 [`docs/live2d-license-and-public-repository-2026-10-09.md`](docs/live2d-license-and-public-repository-2026-10-09.md)。

## Docker 一键启动

复制环境变量模板，不要把真实密钥提交到仓库：

```powershell
Copy-Item .env.example .env
docker compose down
docker compose up --build -d
docker compose ps
```

- 页面：<http://127.0.0.1:8080/>
- 健康检查：<http://127.0.0.1:8080/health>
- 日志：`docker compose logs --tail 200 frontend backend`
- 停止：`docker compose down`

Docker 构建会先运行 `npm run assets:verify`，因此缺少受限资源时会明确失败，不会生成一个人物空白但看似成功的镜像。

## TTS 配置

`.env.example` 不含真实密钥。将本机 `.env` 中的 `DASHSCOPE_API_KEY` 设置为阿里云百炼密钥即可使用 CosyVoice：

```dotenv
TTS_PROVIDER=auto
DASHSCOPE_API_KEY=
DASHSCOPE_WEBSOCKET_URL=
ALIYUN_TTS_MODEL=cosyvoice-v3-flash
ALIYUN_TTS_VOICE=longanqin_v3
ALIYUN_TTS_RATE=1.0
ALIYUN_TTS_PITCH=1.03
TTS_VOICE=zh-CN-XiaoyiNeural
```

密钥只由 FastAPI 容器读取。`TTS_PROVIDER=auto` 且密钥为空时，后端自动使用 `edge-tts / zh-CN-XiaoyiNeural`。前端优先调用 `/api/tts/stream`；不可用时回退 `/api/tts` 完整音频。长文本按中文标点分句，首句优先，后续句后台排队；新请求或取消会清理旧请求、旧队列和旧音频，禁止多路叠加。

## 操作方法

1. 等待人物出现且状态变为 `READY`。
2. 输入任意中文；选择自然、微笑、认真或疑惑，并拖动强度。
3. 点击“开始播报”。生成阶段立即显示反馈，开始后口型按真实音频能量变化。
4. 播放中点击“立即停止”会立即结束当前声音、关闭嘴部并清空待播放分句；修改文字后点击“开始播报”会按新内容重新生成。
5. “重置表达”只恢复自然表情和 62% 强度并清除持久化设置，不清空文本。
6. 人物资源加载失败时，才显示独立的“重新加载人物”按钮；修复资源或网络后点击会释放旧 Canvas、WebGL、监听器和实例再重建。

人工选择的表情和强度保存在 localStorage，刷新后恢复。文本语义可以驱动强调、疑问等身体节奏，但不会覆盖人工表情；自动语义临时状态不写入持久化设置。

## 三段测试文本

- 短：`你好，这是交互式数字人。`
- 中：`本系统支持实时中文播报、表情切换、强度调节和基于真实音频能量的自然口型。`
- 长：`欢迎体验交互式数字人系统。首先，请输入一段新的中文讲解内容，并选择合适的表达状态。系统会优先生成第一句语音，在播放时根据真实音频能量驱动嘴部，同时保留自然眨眼、呼吸、头部和手部动作；后续句子会在后台排队，停止后不会残留声音或口型。`

## 验证环境与方法

最终设备为 Windows 11 家庭中文版（build 26200）、Chrome 154.0.8037.98、Intel Core i7-14700HX、15.7 GB 内存、NVIDIA RTX 4070 Laptop GPU 与 Intel UHD Graphics。浏览器窗口 1920×1080，视口 1904×985，Canvas CSS/渲染缓冲区均为 800×985，DPR 1，WebGL2。

模型触发 `avatar-ready` 后，页面使用 `requestAnimationFrame` 连续采样 60 秒。最终 Docker 前台测试时长 60,009.7 ms、渲染间隔 2,879、平均 47.98 FPS，公式为 `render_intervals / (duration_ms / 1000)`；最低一秒样本 0.18 FPS，首次渲染阶段最大卡顿 10,828.7 ms。全程页面可见、有焦点、窗口尺寸未变化，平均 FPS 达到 30 FPS 验收线，原始数据见 `evidence/2026-10-09-final-acceptance/fps-60s-raw.json`。

最终 Docker 页面连续 10 轮“选择表情和强度→输入→开始→句中停止→等待 3 秒→改文→重播到结束”全部通过。每轮均有 HTTP 200 音频、真实能量口型、停止后 Mouth 0.00、`activeRequests=0`、单 Canvas、无控制台崩溃，详见 `evidence/2026-10-09-final-acceptance/repetition-10-rounds-raw.json` 和 `deliverables/acceptance/repetition-test.csv`。

最终演示视频：`deliverables/demo/interactive-live2d-final-demo.webm`。演示依次覆盖自然待机、四表情、强度变化、现场中文播报、播报中停止、改文重播和恢复默认。

## 关键验收场景

| 场景 | 步骤 | 已验证结果 |
|---|---|---|
| 人物与交互 | Docker 页面加载后切换四表情并调强度 | Live2D 保持眨眼、呼吸、头部和手部动作；参数平滑过渡；设置可刷新恢复 |
| 任意中文播报 | 输入未预置文本，播报中观察声音与嘴部，再停止 | 后端返回真实音频；AnalyserNode 驱动 ParamMouthOpenY；停止后嘴部归零且无叠音 |
| 连续操作 | 连续启动/停止 10 次并检查运行状态 | 10/10 通过，无请求、音频、口型或动作残留 |
| 错误恢复 | 临时令模型配置返回 404，刷新后恢复资源并点击重试 | 页面显示明确错误和独立重试入口；成功后只有一个 Canvas，播报按钮恢复 |
| TTS 回退 | 不配置阿里密钥后输入中文 | 自动使用 edge-tts；流式路径失败时仍保留完整音频回退和明确错误提示 |

## 资源来源与实现边界

- 复用：Live2D 官方 Haru Receptionist 样例模型及原动作；Live2D Cubism SDK for Web Framework/Core；FastAPI、Vite、Nginx、edge-tts、阿里云 DashScope SDK。
- 自行实现：页面与交互、表情参数映射与平滑、表达强度、语义时间线、身体节奏叠加、真实音频口型、分句队列、取消与清理、延迟审计、设置持久化、人物重试和 Docker 集成。
- 未移除或替换 Haru 原有手部动作；新增动作只做低幅叠加。

## 故障处理

- 人物未出现：查看页面错误；确认 `npm run assets:verify` 通过；检查模型、Core、两张纹理和动作 URL；修复后点击“重新加载人物”。
- TTS 失败：查看 `docker compose logs backend`；确认网络、密钥、模型和音色配置；`auto` 模式可清空无效密钥回退 edge-tts。
- 健康检查失败：访问 `/health` 并检查后端容器；前端会等后端健康后启动。
- 页面来源不对：正式端口是 8080；5000 是旧的本地开发端口，不用于 Docker 验收。

## 已知限制

- edge-tts 是外部网络服务，首包延迟存在波动；已通过预热、首句优先、流式入口和缓存减少可控部分，但无法保证外部服务恒定延迟。
- CosyVoice 真实链路必须由使用者提供有效服务端密钥；仓库与浏览器均不包含密钥。
- Live2D 样例和 Cubism Core 的再分发许可有限。公开仓库默认忽略这些文件，下载者必须按官方条款自行获取；这不是法律意见。
- 首次前台 FPS 样本包含约 10.8 秒首次渲染卡顿，最低一秒样本因此偏低；60 秒平均值仍为 47.98 FPS。原始时间戳完整保留，未删除异常样本。

## 证据索引

- `evidence/2026-10-08-tts-latency/`：TTS 阶段耗时、短/长文本和连续停止。
- `evidence/2026-10-08-semantic-motion/`：语义、动作、口型生命周期。
- `evidence/2026-10-09-live2d-stable-refresh/`：刷新稳定性。
- `evidence/2026-10-09-input-responsiveness/`：刷新后输入框响应。
- `evidence/2026-10-09-expression-strength/`：表情和强度。
- `evidence/2026-10-09-final-acceptance/`：最终 60 秒 FPS、视觉检查、模型失败重试及连续 10 轮原始证据。
- `deliverables/acceptance/`：三份已填写验收 CSV。
- `deliverables/demo/interactive-live2d-final-demo.webm`：最终不少于 60 秒演示视频。
- `docs/semantic-motion-control-2026-10-08.md`：语义动作验收说明。
- `docs/tts-latency-optimization-2026-10-08.md`：延迟分析。
- `docs/live2d-license-and-public-repository-2026-10-09.md`：官方许可核查与公开仓库策略。
