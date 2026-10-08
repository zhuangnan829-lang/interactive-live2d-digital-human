# live2d-haru-stable-v1

这是 Haru Reception 技术验证成果的只读冻结快照，用作后续视觉升级失败时的最终备用方案。

## 冻结范围

- `model/`：本次实测的 Haru Receptionist 运行时资源。
- `demo-overlay/`：基于官方 Cubism SDK for Web 5-r.5 的演示入口与应用层源码。
- `demo-overlay/src/main.ts`：中文 TTS、`AnalyserNode`、停止/清理和 `ParamMouthOpenY` 驱动。
- `demo-overlay/src/lappmodel.ts`：眨眼、呼吸、头部微动和 Smile / Serious / Doubt 参数控制。
- `evidence/`：1920×1080 Chrome 截图、60 秒性能数据、控制台及网络记录。
- `FINAL_VALIDATION.md`：来源、授权、文件清单、功能和性能结论。
- `run-chrome-audit.mjs`：本次 Chrome 自动验证脚本。

## 恢复规则

本目录不参与当前 3D 主流程，也不改变现有 UI、TTS、Docker 或人物加载入口。需要恢复 Haru 时，应从此标签检出本目录，并将其模型资源层接入官方 Cubism SDK；不要重写现有 TTS 接口和页面状态机。

禁止在后续视觉筛选中删除或覆盖以下实现：

- Live2D `.model3.json` / `.moc3` 加载逻辑；
- Smile / Serious / Doubt 表情参数逻辑；
- `/api/tts` 调用和音频生命周期；
- `AnalyserNode` 到 `ParamMouthOpenY` 的连续驱动；
- 停止时声音关闭、嘴型归零和对象 URL 清理。

## SDK 复现

出于 SDK 分发边界考虑，快照不复制完整 Cubism Framework、Core 和 `node_modules`。从 Live2D 官方下载 `CubismSdkForWeb-5-r.5.zip`，校验 SHA-256：

`67064A7FB1812CF502F5C4A03BFE12CC638C75A621BB4ACF06BB28763DF06BA0`

把 `demo-overlay/` 覆盖到官方包的 `Samples/TypeScript/Demo/`，把 `model/` 放入样例资源目录并保持 `lappdefine.ts` 中的目录名，即可重建本次演示。

Haru 官方下载包 SHA-256：

`3DB5C9180FC8446F7D92EEE13EA33F584E5D1308E101D7AFA4FE3B037A0ED94E`

