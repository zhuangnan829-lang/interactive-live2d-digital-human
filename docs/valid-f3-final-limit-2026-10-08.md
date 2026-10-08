# VALID Asian_F_3 最后一次视觉极限优化

日期：2026-10-08  
入口：`http://localhost:8080/?avatar=valid-f3`

## 范围

本轮没有修改 `Asian_F_3_Busi.glb`、Morph Target、骨骼、TTS、AnalyserNode、停止、重播或请求互斥逻辑。模型 SHA-256 仍为 `F35E2319A4F3CB3D90B6C74B9E9EC4CB73C79D6C8E7E20E4F408DE4FCBE4ED79`。

## 最终调整

- 镜头：FOV 27°；位置 `(0.03, 1.50, 1.31)`；目标 `(-0.08, 1.48, 0)`。画面固定为胸口以上，保留头顶空间。
- 皮肤：运行时转换为 `MeshPhysicalMaterial`；roughness `0.76`、envMapIntensity `0.42`、IOR `1.4`、clearcoat `0.035`、sheen `0.07`。面部分区加入低幅暖色散射近似和约 5.5% 的微粗糙度变化。
- 眼睛：独立 `MeshPhysicalMaterial`；roughness `0.08`、IOR `1.376`、clearcoat `1`、clearcoatRoughness `0.045`，使用冷暖两个低强度点光形成高光。
- 头发：roughness `0.77`、sheen `0.12`、anisotropy `0.08`、envMapIntensity `0.35`。较强各向异性曾放大贴图分片，已回调。
- 服装：不改纹理和几何；运行时保留原始明暗分区，外层为低反光灰蓝，中央内搭为较低对比度浅灰蓝。
- 灯光：ACES Filmic 曝光 `0.81`；主光、辅光、面光、轮廓光和双眼部高光；蓝灰渐变背景保持不变。
- 表情：微笑权重降低以避免夸张；认真采用轻微双眉下压和收敛视线；疑惑采用单侧抬眉、约 0.064 rad 侧倾和轻微视线偏移。
- 待机：保留随机眨眼、约 7 mm 呼吸位移、低幅头部和视线微动。

## 浏览器验证

| 项目 | 结果 |
|---|---|
| 自然 | 无眉压；眨眼、呼吸和微动存在 |
| 微笑 | 嘴角自然抬起，眼部有低幅变化 |
| 认真 | 没有愤怒表情；与自然可见轻微眉眼差异，但辨识度仍有限 |
| 疑惑 | 单侧眉、视线和头部侧倾可见 |
| 播报 | 真实中文 MP3 播放；截图可见 AnalyserNode 驱动的非零口型 |
| 停止 | 立即回到 `READY`，页面确认口型复位 |
| Console | 0 warning，0 error |
| Network | GLB 首次请求 HTTP 200 / 2,103,076 bytes；缓存复测 HTTP 304；TTS HTTP 200；health HTTP 200 |
| 构建与 Docker | `npm run build` 通过；前端运行，后端 healthy |

## 性能

- 视口：1920×1080；DPR 1；canvas 1104×1080。
- 采样：60.0096 秒，5232 帧，平均 **87.19 FPS**，最大帧间隔 30.5 ms。
- 全程 `visible=true`、`focused=true`，没有失焦、隐藏或尺寸变化。
- 缓存复测首次 `READY`：759.5 ms；GLB 资源重验证 34.4 ms、HTTP 304。
- 结束时 used JS Heap：94,852,114 bytes，约 90.46 MiB。
- 原始数据：[fps-audit.json](../evidence/2026-10-08-valid-f3-final-limit/fps-audit.json)。

## 视觉结论

这轮已经达到当前资产在不改模型、纹理、Morph 和骨骼前提下的合理代码优化上限。胸像构图、眼部高光、面部曝光和服装配色比上一版更接近产品讲解员，但仍未达到参考图或最终交付标准：

- 脸部基础网格与贴图缺少毛孔、微法线和真实皮肤层次，仍有塑料感；
- 眼睛没有独立角膜几何，clearcoat 只能改善高光，不能产生真实眼球深度；
- 头发是低精度块面和分片贴图，横向接缝可见；
- 服装几何本质仍是紧身上衣，颜色分区不能变成真实西装结构；
- 认真与自然的 Morph 差异有限，继续增大权重会转向愤怒。

因此 **VALID F3 仍不通过最终年轻 AI 产品数字讲解员视觉验收**。剩余差距来自基础模型资产，不应继续通过灯光或 shader 掩盖。下一步应进入 TOMNOOK Asian Business Woman FF2 的许可、原始资源、Morph、骨骼、Three.js 转换和性能隔离验证，在验证通过前不直接购买或替换。

## 证据

- [优化前](../evidence/2026-10-08-valid-f3-final-limit/before-last-pass.jpg)
- [自然 1920×1080](../evidence/2026-10-08-valid-f3-final-limit/natural-1920x1080.jpg)
- [微笑 1920×1080](../evidence/2026-10-08-valid-f3-final-limit/smile-1920x1080.jpg)
- [认真 1920×1080](../evidence/2026-10-08-valid-f3-final-limit/serious-1920x1080.jpg)
- [疑惑 1920×1080](../evidence/2026-10-08-valid-f3-final-limit/curious-1920x1080.jpg)
- [播报口型 1920×1080](../evidence/2026-10-08-valid-f3-final-limit/speaking-1920x1080.jpg)
- [FPS 审计](../evidence/2026-10-08-valid-f3-final-limit/fps-audit-1920x1080.jpg)
- [对照表](../evidence/2026-10-08-valid-f3-final-limit/contact-sheet.jpg)

