# Haru Reception 稳定版本冻结记录

版本标签：`live2d-haru-stable-v1`  
冻结日期：2026-10-08  
用途：Live2D 最终备用方案；第二阶段仅允许替换模型资源层。

## 模型来源与授权

- 模型：Live2D 官方 Haru Receptionist（项目内简称 Haru Reception）。
- 官方页面：https://www.live2d.com/en/learn/sample/haru-receptionist/
- 官方下载：https://cubism.live2d.com/sample-data/bin/haru_greeter/haru_greeter_ja.zip
- 样例条款：https://www.live2d.com/en/learn/sample/model-terms/
- Free Material License：https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
- 使用说明：属于 Live2D 原创样例角色。一般用户及年销售额低于 1000 万日元的小规模企业可按官方样例条款用于商业或非商业展示，并须遵守署名、角色形象和禁止再分发等限制；更大规模组织的公开商业使用需额外取得许可。
- 已知文件限制：独立 Haru Receptionist 包包含 `.moc3`、`.model3.json`、27 个 `.motion3.json`、`.physics3.json`，但没有 `.exp3.json`。本次 Smile / Serious / Doubt 由真实模型参数实时实现。

## Web 环境

- SDK：Live2D Cubism SDK for Web 5-r.5 官方包。
- Cubism Core 控制台版本：6.0.1。
- 浏览器：Chrome 154，Windows 10，1920×1080，DPR 1。
- 图形：WebGL2；ANGLE / Intel UHD Graphics / Direct3D11。

## 60 秒性能

- 计时起点：模型触发 READY 后。
- 时长：60,006 ms。
- 平均：149.37 FPS。
- 最低一秒样本：98.41 FPS。
- 结论：通过 `FPS >= 30` 门槛。
- 限制：该轮为本机 Chrome 无头 GPU 模式；正式发布前仍保留前台 Chrome 人工复测要求。

## TTS 与口型

- 中文语音由现有 `/api/tts` 返回真实音频。
- 音频链路：`HTMLAudioElement → AudioContext → AnalyserNode`。
- 单次播报中 `ParamMouthOpenY` 最大值：0.9999995。
- 播报采样瞬间 `ParamMouthOpenY`：0.4614。
- 点击停止后：声音停止，`ParamMouthOpenY = 0`。
- 结论：口型为连续模型参数驱动，不是图片或预录视频切换。

## 表情

| 状态 | MouthForm | Brow L Y | Brow R Y | Head Z |
|---|---:|---:|---:|---:|
| Natural | 0 | 0 | 0 | 0.376（待机瞬时值） |
| Smile | 0.484 | 0.074 | 0.074 | 0.287 |
| Serious | -0.136 | -0.260 | -0.260 | 0.161 |
| Doubt | -0.050 | 0.322 | -0.050 | 5.284 |

Haru 同时具备并已运行自动眨眼、呼吸和轻微头部运动。

## 不可回退项

第二阶段不重新开发主流程，只允许替换模型资源层。必须保留：

- 当前 UI 与 Docker 结构；
- Live2D 加载逻辑；
- Smile / Serious / Doubt 表情控制逻辑；
- TTS 接口、请求取消及音频清理逻辑；
- `ParamMouthOpenY` 音频驱动与停止归零逻辑。

冻结源码、模型和原始证据位于 `frozen/live2d-haru-stable-v1/`。
