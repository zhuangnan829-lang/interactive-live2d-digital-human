# VALID Asian_F_3 视觉优化与浏览器复测记录

日期：2026-10-08  
诊断入口：`http://localhost:8080/?avatar=valid-f3`  
性能入口：`http://localhost:8080/?avatar=valid-f3&audit=1`

## 结论

本轮只调整 VALID F3 的适配层、场景和诊断记录，没有修改 GLB，也没有改动 TTS、AnalyserNode、停止、重播或请求互斥逻辑。默认人物仍为 Rocketbox，VALID F3 仍只通过查询参数加载。

镜头、曝光、背景分离和服装颜色已有明显改善，表情与真实音频口型仍可用，性能远高于 30 FPS 要求。但 F3 仍然明显接近早期游戏 NPC：脸部网格和纹理层次不足、眼睛高光和湿润感有限、头发为整体块面、服装几何仍是紧身上衣，四种表情在遮住按钮文字后只有微笑和疑惑较容易区分。因此 **不达到最终“年轻、可信、现代 AI 产品数字讲解员”的视觉标准**，应停止继续用灯光和材质参数修补，下一路线是先核查 TOMNOOK Asian Business Woman FF2 的许可与技术能力，再决定是否采购或转换。

## 实际调整

- 相机：FOV 27°，位置 `(0.03, 1.50, 1.34)`，目标 `(-0.08, 1.49, 0)`，形成胸口/腰部以上构图。
- 色调映射：ACES Filmic，曝光 `0.79`。
- 环境光：半球光 `#eaf5ff / #344a5f`，强度 `0.82`。
- 主光：`#fff2e5`，强度 `1.60`，位置 `(2.3, 3.4, 3.1)`。
- 辅光：`#c8ddff`，强度 `0.50`，位置 `(-2.8, 2.25, 2.5)`。
- 面部补光：`#fff5eb`，强度 `0.48`，位置 `(0, 1.6, 4)`。
- 轮廓光：`#aed8ff`，强度 `1.25`，位置 `(-2.6, 2.9, -2.2)`。
- 眼部点光：`#e8f6ff`，强度 `4.5`，距离 `3.5`，衰减 `2`，位置 `(0.18, 1.62, 1.35)`。
- 背景：浅蓝灰线性渐变加面部后方径向柔光；雾色 `#6f8ba5`。
- 皮肤/身体材质：roughness `0.72`、metalness `0`、envMapIntensity `0.55`、法线强度乘 `0.58`。
- 服装：在运行时按世界高度和暗色纹理遮罩混合灰蓝色，不改写模型纹理或 GLB。
- 眼睛：roughness `0.12`、envMapIntensity `1.65`，保留独立眼部材质实例。
- 头发：MeshPhysicalMaterial，roughness `0.68`、sheen `0.32`、sheenRoughness `0.8`、envMapIntensity `0.65`。
- 表情：微笑增加闭口/开口嘴角与轻微 squint；认真仅使用低强度双眉下压和轻微点头；疑惑使用单侧抬眉、头部侧倾和视线偏移。

## 浏览器结果

| 项目 | 结果 |
|---|---|
| 自然、微笑、认真、疑惑 | 均可驱动并保存 1920×1080 截图；微笑和疑惑可辨识，认真与自然差异偏弱 |
| 真实中文 TTS | `SPEAKING`，Nginx 记录 `/api/tts` HTTP 200 |
| 音频口型 | 截图中可见非零张嘴，来自现有 AnalyserNode 能量链路 |
| 停止 | 立即回到 `READY`，提示“口型已复位” |
| 10 轮稳定性 | 10/10 均进入 `SPEAKING` 并停止回到 `READY`；未见叠音、崩溃或动画累积 |
| Console | 10 条模型加载 info；0 条 warning/error |
| Network | F3 GLB HTTP 200（后续缓存请求 304）；10 轮 TTS 请求均 HTTP 200；`/api/health` HTTP 200 |
| 生产构建 | `npm run build` 通过；仅保留 Vite 大 chunk 提示 |
| Docker | 前端运行，后端 healthy |

## 60 秒前台性能

- 视口：1920×1080；DPR 1；Three.js canvas 1104×1080。
- 浏览器：Chromium 152（Windows 10 x64 UA，Codex 前台浏览器）。
- 采样期间：`visible=true`、`focused=true`，无失焦、隐藏或尺寸变化。
- 时长：60.0114 秒；帧数：6387；平均 FPS：106.43；最大帧间隔：345.6 ms。
- 首次进入 `READY`：最终生产构建重新加载实测 618.5 ms（Navigation Timing 起点至渲染循环首次确认模型就绪）。正式 60 秒样本中的 GLB Resource Timing 为 63.2 ms；传输 2,103,376 bytes，响应体 2,103,076 bytes。
- 测试设备：Intel Core i7-14700HX；NVIDIA RTX 4070 Laptop GPU / Intel UHD Graphics；Windows 11 64 位。
- 结束时 JS Heap：98,637,357 bytes（约 94.1 MiB）；total 101,504,661 bytes。
- 原始数据：[fps-audit.json](../evidence/2026-10-08-valid-f3-visual-optimization/fps-audit.json)。

## 证据

- 优化前：[before-natural.png](../evidence/2026-10-08-valid-f3-visual-optimization/before-natural.png)
- 优化后自然：[after-natural-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/after-natural-1920x1080.jpg)
- 微笑：[after-smile-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/after-smile-1920x1080.jpg)
- 认真：[after-serious-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/after-serious-1920x1080.jpg)
- 疑惑：[after-curious-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/after-curious-1920x1080.jpg)
- 播报口型：[speaking-mouth-1-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/speaking-mouth-1-1920x1080.jpg)
- 对照表：[contact-sheet.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/contact-sheet.jpg)
- 性能面板：[fps-audit-1920x1080.jpg](../evidence/2026-10-08-valid-f3-visual-optimization/fps-audit-1920x1080.jpg)
