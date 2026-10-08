# 年轻女性数字人候选核查（2026-10-08）

本记录只用于候选选择。默认人物仍是 Rocketbox `Female_Adult_02`，旧 VRM 回退和现有 TTS、AnalyserNode、停止与重播逻辑均未替换。

## 结论

当前没有一份候选同时满足“接近方案 A 的年轻亚洲女性外观”和“已在本项目真实加载并核验全部控制能力”。建议优先取得 TOMNOOK FF2 的源文件做隔离转换和 Three.js 审计；在文件到手前不将商品页宣传写成实测结论。

| 候选 | 视觉匹配 | 文件与实时能力 | 授权 | 当前判断 |
|---|---|---|---|---|
| TOMNOOK `Asian Business Woman FF2` | 三者中最接近年轻亚洲科技讲解员；服装和发型可组合 | Blender/FBX/UE5/C4D；2K–4K PBR；52 ARKit；完整绑定；无现成 GLB，需转换 | ArtStation Extended Commercial License，页面标价 USD 64 | **首选获取候选**。必须购买后检查实际文件、Morph 名、骨骼、材质和 Web 端大小 |
| Ida Faber `Business Lady Office Girls` | 亚洲年轻女性、三种发型和办公室服装，方向接近参考图 | FBX/OBJ、Humanoid rig、眼/下颌骨、52 ARKit；4K PBR 贴图；页面同时提供 Unity/UE 自定义 Shader 与标准材质路径；无 GLB | Fab 页面要求选择许可，但公开抓取未返回具体许可档位和价格 | **高风险备选**。许可、价格、FBX 内容和标准材质转换均须在获取前复核 |
| VALID `Asian_F_3_Busi` | 亚洲女性、中短发、商务服装；脸、头发、服装和肩线明显低于参考图 | 单文件 GLB 2,103,076 bytes；标准 PBR；Meshopt + WebP；65 面部 Morph；头、颈、眼、肩骨骼 | 原 VALID 与 c-frame 转换仓库均为 MIT | **技术通过、视觉淘汰**。真实加载约 90–96 FPS，但不作为最终人物 |

## 候选 A：TOMNOOK FF2

- 作者：TOMNOOK 3D PEOPLE。
- 来源：https://www.artstation.com/marketplace/p/MOxRo/modular-character-asian-business-woman-3d-model-ff2-blender-ue5-c4d
- 页面声明：Blender 4.1、FBX、UE5、C4D；2K–4K PBR 贴图；Blender rig；52 ARKit Blendshape；8 个动画。
- 规模：人物 33,622 tris，头发 38,078 tris，服装 49,794 tris，鞋 9,128 tris；无 LOD。
- 下载包页面标称：FBX 96 MB、Blender 20 MB、纹理 350 MB。
- Web 风险：不是单文件 GLB；需要在 Blender 中合并选定头发/服装、嵌入或压缩贴图、导出 GLB，并逐项核查材质和 Morph 是否保留。
- 尚未实测：文件大小、标准 Three.js 材质、Morph 名称、眼球与头颈肩骨骼、实际 FPS。

## 候选 B：Business Lady Office Girls

- 作者：Ida Faber。
- 来源：https://www.fab.com/listings/9026e128-699a-46fe-99d4-8a1ac6b0edb9
- 页面声明：三种发型和刘海、模块化服装、Humanoid rig、眼和下颌骨、52 Apple ARKit Blendshape、4K PBR 贴图。
- 格式：Unity、Unreal、FBX、OBJ；没有现成 GLB。
- Shader：Unity/UE 项目带自定义 Shader，但页面说明 Unity 可切换标准材质并保留贴图。是否能形成外观一致的标准 glTF PBR 尚未实测。
- 尚未实测：许可档位、价格、单个组合文件大小、Morph 名、骨骼名、Three.js 材质和 FPS。
- 风险：页面带 `Anime` / `Stylized` 标签，必须用实际模型近景判断是否明显二次元。

## 候选 C：VALID Asian_F_3_Busi

- 原作者：Tiffany D. Do、Steve Zelenty、Mar Gonzalez-Franco、Ryan P. McMahan；GLB 转换由 c-frame/vincentfretin 提供。
- 原库固定提交：`31faed0138b7c0dd97e380ab04921c70a5d5c9f8`。
- GLB 转换库固定提交：`c4719df7a2b60a96cc7f56d67e247674b68c4ea7`。
- 文件：`frontend/public/assets/candidates/Asian_F_3_Busi.glb`。
- 大小：2,103,076 bytes；SHA-256：`F35E2319A4F3CB3D90B6C74B9E9EC4CB73C79D6C8E7E20E4F408DE4FCBE4ED79`。
- 结构：8 meshes、2 标准 PBR materials、8 skins、4 内嵌图片、65 个脸部 Morph、31 个下牙 Morph、无动画。
- 扩展：`EXT_meshopt_compression`、`EXT_texture_webp`、`KHR_mesh_quantization`；不依赖 Unity/Godot 专用 Shader。
- 控制：左右眨眼、7 组 viseme、嘴部开合、左右微笑、左右眉升降、眼球骨骼、Head/Neck/Shoulder 骨骼均已在 GLB JSON 中核验。
- 浏览器：`?avatar=valid-f3` 实际进入 READY，观察值约 90–96 FPS；四种状态参数可驱动，控制台未见 warning/error。此数值是候选预览观察，不是 1920×1080 前台正式性能验收。
- 淘汰原因：外观仍像早期研究/仿真角色，材质、头发、服装和肩线不符合现代 AI 产品助手标准。

## 真实浏览器证据

- `evidence/2026-10-08-young-female-candidates/valid-f2-natural.png`
- `evidence/2026-10-08-young-female-candidates/valid-f2-smile.png`
- `evidence/2026-10-08-young-female-candidates/valid-f3-natural.png`
- `evidence/2026-10-08-young-female-candidates/valid-f3-serious.png`
- `evidence/2026-10-08-young-female-candidates/valid-f3-curious.png`
- `evidence/2026-10-08-young-female-candidates/default-rocketbox-preserved.png`

## 下一道确认门

只有取得候选 A 或 B 的实际文件后，才能完成以下硬核查：源文件许可快照、实际大小、Morph/骨骼清单、标准 PBR 转换、Three.js 真实加载、四表情与真实 TTS 口型、1920×1080 性能。通过后再替换默认人物。
