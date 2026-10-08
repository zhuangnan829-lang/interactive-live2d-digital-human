# Live2D 半写实 AI 课程讲师：模型筛选与 Web 验证

日期：2026-10-08  
验证环境：Windows 10 / Chrome 154 / 1920×1080 / WebGL2 / Intel UHD Graphics D3D11  
SDK：Live2D Cubism SDK for Web 5-r.5（官方包）

## 结论

当前没有一款候选同时满足“女性、半写实、商务课程讲师、授权清晰、五类运行时文件齐全、已验证 Web 稳定”全部条件。

- **技术验证首选：Haru Receptionist / Haru Reception。** 女性商务接待形象最接近参考图 1，Web、动作、表情参数和中文 TTS 口型均已实测通过；但官方独立下载包没有 `.exp3.json`，画风也仍偏日系插画，不应伪称为最终半写实成品。
- **五类文件完整首选：Izumi。** `.moc3`、`.model3.json`、`.motion3.json`、`.physics3.json`、`.exp3.json` 均存在，女性且相对成熟；但服装不是商务装，课程讲师匹配度低于 Haru。
- **Ren Foster 淘汰。** 文件和技术能力完整，但角色为男性，违反本阶段明确的女性要求。
- **正式产品建议：按参考图 1 定制原创商务女性 Live2D 模型。** 现成商业市场中检索到的“窓口みどり”用途接近且授权说明相对清晰，但未购买前无法核验实际压缩包、Web SDK 兼容性和五类文件，暂时只能列为待购前确认候选，不能判定通过。

## 官方候选文件核验

| 候选 | `.moc3` | `.model3.json` | `.motion3.json` | `.physics3.json` | `.exp3.json` | 判定 |
|---|---:|---:|---:|---:|---:|---|
| Haru Receptionist 独立包 | 1 | 1 | 27 | 1 | **0** | 业务视觉最合适；严格文件门槛不通过 |
| Izumi 独立包 | 1 | 1 | 10 | 1 | 7 | 文件门槛通过；商务视觉不足 |
| Ren Foster 独立包 | 1 | 1 | 3 | 1 | 5 | 技术通过；性别门槛不通过 |

说明：Cubism SDK 自带另一个 `Haru` 样例，包含 8 个 `.exp3.json`，但它不是本次独立下载的 Haru Receptionist 运行时包，不能混为同一交付物。

## 官网、下载与授权

### Haru Receptionist

- 官方介绍：https://www.live2d.com/en/learn/sample/haru-receptionist/
- 官方下载：https://cubism.live2d.com/sample-data/bin/haru_greeter/haru_greeter_ja.zip
- 官方样例条款：https://www.live2d.com/en/learn/sample/model-terms/
- Free Material License：https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
- 使用范围：属于 Live2D 原创样例角色。一般用户及年销售额低于 1000 万日元的小规模企业可按样例条款用于商业或非商业用途，并须保留/展示版权信息；更大规模组织的公开商业使用需取得额外许可。仍须遵守角色形象、禁止再分发等限制。

### Izumi

- 官方介绍：https://www.live2d.com/en/learn/sample/izumi/
- 官方下载：https://cubism.live2d.com/sample-data/bin/izumi/izumi_ja.zip
- 授权与使用范围：同上，适用 Live2D 官方样例模型条款与 Free Material License。

### Ren Foster

- 官方介绍：https://www.live2d.com/en/learn/sample/ren-foster/
- 官方下载：https://cubism.live2d.com/sample-data/bin/ren/ren_en.zip
- 授权与使用范围：同上，适用 Live2D 官方样例模型条款与 Free Material License。

### Cubism SDK for Web

- 官方下载页：https://www.live2d.com/en/sdk/download/web/
- SDK 发布许可：https://www.live2d.com/en/sdk/license/
- 本次使用官方 `CubismSdkForWeb-5-r.5.zip`，未使用非官方渲染封装。

### 商业候选：窓口みどり

- 正规销售页/购买下载：https://booth.pm/en/items/4685752
- 页面许可摘要：列明个人和法人商业使用、产品宣传、演示、数字接待、应用/游戏/视频等用途可用；允许纹理编辑；禁止转售、转让、再分发和冒充作者。
- 未通过项：公开页面不能证明交付包包含全部五类文件，也不能替代购买后的压缩包核验；未做 Web SDK、表情和口型实测。因此当前状态为 **条件候选，不是已验证模型**。

## 下载包完整性

| 文件 | SHA-256 |
|---|---|
| `CubismSdkForWeb-5-r.5.zip` | `67064A7FB1812CF502F5C4A03BFE12CC638C75A621BB4ACF06BB28763DF06BA0` |
| `haru_greeter_ja.zip` | `3DB5C9180FC8446F7D92EEE13EA33F584E5D1308E101D7AFA4FE3B037A0ED94E` |
| `izumi_ja.zip` | `39ED8F111DA39F731DD079680D918CD4AEDC23A99C63E39535C9F045A129CBDE` |
| `ren_en.zip` | `FD4C8A363178669721A71E57B32959D0F1DA660ED1C16F08F88BA13C966388DC` |

## Web 与数字人功能实测

隔离演示路径：`demo/Samples/TypeScript/Demo`  
演示模型：`haru_greeter_t05`  
渲染：官方 Cubism Core + Framework + WebGL2

已实现并实测：

- 浏览器加载 `.model3.json` / `.moc3` / 纹理 / physics / motions。
- 待机自动眨眼、呼吸、轻微头部运动。
- Smile：改变 `ParamMouthForm`、双眼笑参数、双眉高度和头部微动。
- Serious：嘴角下压、双眉下压/角度变化、头部角度变化。
- Doubt：左右眉不对称、眼球横移、`ParamAngleZ` 明显偏转。
- 中文 TTS：调用现有 `/api/tts`，由 `HTMLAudioElement → AudioContext → AnalyserNode` 的真实音频能量驱动 `ParamMouthOpenY`。
- 停止：音频暂停、对象 URL 清理、`ParamMouthOpenY` 复位为 0。

关键实测参数：

| 状态 | MouthOpenY | MouthForm | Brow L Y | Brow R Y | Head Z |
|---|---:|---:|---:|---:|---:|
| Natural | 0 | 0 | 0 | 0 | 0.376（待机微动瞬时值） |
| Smile | 0 | 0.484 | 0.074 | 0.074 | 0.287 |
| Serious | 0 | -0.136 | -0.260 | -0.260 | 0.161 |
| Doubt | 0 | -0.050 | 0.322 | -0.050 | 5.284 |
| Speaking（采样瞬间） | 0.461 | 0.484 | 0.074 | 0.074 | -0.396 |
| Stop | **0** | 0.484 | 0.074 | 0.074 | -0.337 |

单次播报中 `ParamMouthOpenY` 最大值为 `0.9999995`；停止后实测为 `0`。这不是图片切换，而是模型参数连续变化。

## 60 秒性能

- 视口：1920×1080，DPR 1
- 时长：60,006 ms（模型 READY 后开始计时）
- 平均：**149.37 FPS**
- 最低一秒样本：**98.41 FPS**
- WebGL：2.0
- GPU：ANGLE / Intel UHD Graphics / Direct3D11
- 结论：超过 `FPS >= 30` 门槛。

注意：该结果来自本机 Chrome 无头模式，因此绝对 FPS 不应外推到所有客户设备；但使用的是本机 Intel GPU D3D11 WebGL2 渲染器，且 60 秒内最低秒样本仍显著高于门槛。正式集成后仍需在目标前台 Chrome 再做一次人工验收。

## 证据

- `evidence/chrome-audit/audit-results.json`：性能、参数、口型和环境完整数据。
- `evidence/chrome-audit/01-natural.png` 至 `07-final-60s.png`：自然、三种表情、播报、停止、60 秒结果截图。
- `evidence/chrome-audit/console.json`：无运行时异常；仅有 Vite 调试信息、Cubism Core 版本信息和缺失 favicon 的 404。
- `evidence/chrome-audit/network-failures.json`：一次页面重导航取消以及 favicon 404；模型和 TTS 请求未失败。

## 进入正式项目的门槛

建议不要把 Haru 当成最终视觉资产直接发布。下一步应先完成以下决策之一：

1. 用 Haru 作为短期技术占位，正式项目接入已经验证的 Live2D 渲染和 TTS 参数链路；或
2. 先委托制作与参考图 1 接近的原创女性商务讲师，并在合同中明确 Web/商业使用、再开发、模型数据交付和不可撤销使用期限，再替换进同一运行时接口。

定制交付必须写入：`.moc3`、`.model3.json`、至少三组 `.motion3.json`、`.physics3.json`、Smile/Serious/Doubt 的 `.exp3.json`，以及 `ParamMouthOpenY`、眼睛、双眉、嘴角、头部 XYZ、呼吸等参数。
