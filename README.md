# 交互式数字人

> 当前状态：受控正式接入中。Rocketbox 人物资源已经完成隔离许可、转换与独立 Three.js 审计；正式页面、口型回归和完整稳定性记录仍须以本项目实际浏览器结果为准，不能据此视为验收通过。

## 启动

复制 `.env.example` 为 `.env`（可选），然后执行：

```bash
docker compose up --build
```

页面为 `http://localhost:8080`，健康检查为 `http://localhost:8080/health`。

## 当前架构

- `frontend/`：React/Vite 页面、状态机、控制面板和 Web Audio 分析入口。
- `backend/`：FastAPI TTS 代理。默认使用 `edge-tts` 的 `zh-CN-XiaoxiaoNeural`，运行时从后端环境变量读取配置。
- `docker-compose.yml`：分别构建前端 Nginx 与后端 TTS 服务。

浏览器 `speechSynthesis` 不作为主路线，因为其输出通常不能稳定接入 `AnalyserNode`。主路线是取得后端返回的真实 MP3/WAV 后再做音频分析与口型驱动。

## 已实际执行的 P0 记录

- 2026-10-07：`npm run build` 成功。
- 2026-10-07：`docker compose up --build -d` 成功，前端 HTTP 200，`/health` 返回 `status: ok`。
- 2026-10-07：向 `/api/tts` 提交中文文本，收到 24,912 字节 MP3 响应。

上述结果不代表模型、表情、口型、60 秒 FPS、10 轮连续操作或 Docker 全新环境验收已完成。

## 待完成与资源许可

必须选择并记录一个半写实、可浏览器实时运行、带可用面部 morph target/blendshape 的模型。记录至少包括：文件名、作者、来源 URL、版本、许可、再分发条件和获取步骤。若许可不允许随仓库分发，应提供官方获取步骤，不把受限素材提交到仓库。

## 当前正式人物候选

- 默认人物：Microsoft Rocketbox `Female_Adult_02`，以单一标准 glTF 2.0 GLB 加载。
- 资源：`frontend/public/assets/rocketbox/Female_Adult_02_facial.glb`；SHA-256 为 `02AB176BC341F016BBB657A376B55B21C400DBFD74699FE3CB067D5CE7742397`。
- 许可、固定上游提交、Blender 转换、校验和已核验的骨骼/Morph Target 见 [Rocketbox-Female_Adult_02.md](docs/licenses/Rocketbox-Female_Adult_02.md)。
- 默认加载失败时页面显示真实错误与重试入口；为诊断保留旧 VRM：在开发测试环境访问 `?avatar=vrm` 可显式加载它。`?avatar=missing` 是仅用于验证真实失败与重试提示的测试入口。两者都不是默认行为，也不会静默代替 Rocketbox 成功状态。
- 当前实现使用 `AK_09_EyeBlinkLeft` / `AK_10_EyeBlinkRight` 眨眼，`AK_44_MouthSmileLeft` / `AK_45_MouthSmileRight` 微笑，眉部 Morph Target 形成认真和疑惑，以及 `AK_25_JawOpen`、`AA_VI_10_aa`、`AA_VI_13_O` 响应真实音频能量。

## 年轻女性候选诊断

- 默认人物尚未替换。`?avatar=valid-f1`、`?avatar=valid-f2`、`?avatar=valid-f3` 仅用于加载开放许可的 VALID 亚洲女性商务模型，核对 Three.js、Morph、骨骼和材质链路。
- VALID F2/F3 已在真实浏览器中加载并驱动表情，但视觉质量不符合最终年轻 AI 讲解员标准，不进入正式替换。
- 候选来源、许可、实测范围和商业模型待核查项见 [young-female-shortlist-2026-10-08.md](docs/candidates/young-female-shortlist-2026-10-08.md)。
- VALID F3 的镜头、灯光、运行时材质优化、四种表情/TTS 截图与 1920×1080 前台 60 秒复测见 [valid-f3-visual-optimization-2026-10-08.md](docs/valid-f3-visual-optimization-2026-10-08.md)。优化后平均 106.43 FPS，但视觉仍有明显早期游戏 NPC 质感，已停止继续修补，不作为最终人物。
- 按要求完成的最后一次资产内视觉极限优化见 [valid-f3-final-limit-2026-10-08.md](docs/valid-f3-final-limit-2026-10-08.md)。最终 PhysicalMaterial 版本在 1920×1080 前台 60 秒平均 87.19 FPS；功能与性能合格，但脸部、头发和服装的资产上限仍不满足最终视觉验收，后续不再继续调灯光或 shader。
- TOMNOOK FF2 已进入隔离审计的资源/许可阶段，记录见 [tomnook-ff2-isolation-audit-2026-10-08.md](docs/candidates/tomnook-ff2-isolation-audit-2026-10-08.md) 与 [TOMNOOK-FF2-license-review.md](docs/licenses/TOMNOOK-FF2-license-review.md)。本地没有合法源文件，因此骨骼、Morph、转换、Three.js 与 FPS 均仍是待验证，不得根据商品页宣称通过。

## 本轮实际验证记录（2026-10-08）

- 前端 `npm run build` 与 Docker 内前端生产构建均成功；构建仅报告现有 JavaScript chunk 大于 500 kB 的 Vite 警告。
- Docker 前后端实际启动，后端健康检查返回正常。
- 浏览器默认页面实际请求 `GET /assets/rocketbox/Female_Adult_02_facial.glb`，Nginx 返回 HTTP 200、47,635,796 bytes；控制台记录 Rocketbox 加载成功，未见关键控制台错误。
- 浏览器实际操作过自然、微笑、认真、疑惑和强度控制；实际观察到 Rocketbox Morph Target 的平滑变化、随机眨眼、低幅呼吸与头部/视线微动。人物手臂已由默认外展姿势向下调整，但肩部和手臂的自然度仍是已知视觉限制。
- 现场输入未预置中文文本后，页面实际进入 `SPEAKING`；真实后端语音播放时可观察到 `AK_25_JawOpen`、`AA_VI_10_aa`、`AA_VI_13_O` 的非匀速口型。播报中切换表情未中断；停止后页面回到 `READY` 并显示口型已复位。
- 连续 10 轮“改文 → 播报 → 中途停止”均在实际浏览器中进入 `SPEAKING`，并在停止后回到口型复位状态。刷新后已验证表情和强度保存；恢复默认后已验证返回自然状态与 55% 强度。
- `?avatar=missing` 实测进入错误状态并显示重试按钮；重试后仍如实显示加载错误。`?avatar=vrm` 实测可显式载入旧 VRM 作为诊断回退，默认路径不会静默回退。
- 性能：隔离 Rocketbox GLB 页面在 1920×1080 前台曾实测 67.25 FPS。正式页面的 60 秒自动化样本在等待期间被浏览器后台节流，显示 18 FPS 且末尾单秒为 1 FPS；此样本按验收规则无效，不能用于声明 30 FPS 已通过，须在真正前台浏览器窗口重新完整测量。
