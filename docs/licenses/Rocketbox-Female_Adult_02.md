# Microsoft Rocketbox · Female_Adult_02

## 项目内使用的资源

- 网页资源：`frontend/public/assets/rocketbox/Female_Adult_02_facial.glb`
- 网页使用的是转换后的单一 GLB；原始 FBX、原始纹理、完整 Rocketbox 仓库和 Blender 便携包均不进入网页目录。
- GLB SHA-256：`02AB176BC341F016BBB657A376B55B21C400DBFD74699FE3CB067D5CE7742397`
- GLB 大小：47,635,796 bytes（45.43 MiB）。

## 来源与许可

- 上游仓库：https://github.com/microsoft/Microsoft-Rocketbox
- 固定提交：`0943055db6ec570bcef9f2c8b41c9e5467c808f9`
- 上游状态：GitHub API 在 2026-10-08 返回 archived=true。
- 许可证：MIT License，Copyright (c) 2020 Microsoft；完整文本保存在同目录 `Rocketbox-MIT-LICENSE.md`。
- 上游 README 说明：2020-11 资源库更新为 MIT；2022-02 提供带 15 个 viseme、48 个 FACS 与 Vive facial tracker shape 的 facial FBX。审计固定提交的文件树未发现 Female_Adult_02 的独立例外许可证或第三方归属文件。

## 可复现转换

- 转换工具：Blender 4.5.14 LTS，Windows x64 便携 ZIP。
- 官方下载：https://mirror.blender.org/release/Blender4.5/blender-4.5.14-windows-x64.zip
- 官方 SHA-256 清单：https://mirror.blender.org/release/Blender4.5/blender-4.5.14.sha256
- 工具 ZIP SHA-256：`B9533D2397AC1984DB4466FB23A7A4649391CCA93F6E84209F9BCC60D071C8B9`。
- 原始输入：`Assets/Avatars/Adults/Female_Adult_02/Export/Female_Adult_02_facial.fbx`，SHA-256 `BEFEEBA2248DCB59E5A2875301B0192C8BEAA1F14051A642840CFCE9C9CDB053`。
- 转换脚本：同目录 `rocketbox-convert-fbx-to-glb.py`。脚本将 FBX 中已经失效的绝对纹理路径映射到其原始 `Textures/` 目录，嵌入贴图并导出标准 glTF 2.0 GLB；导出时关闭动画打包、保留 skins 与 morph target。

示例命令（原始 FBX 和纹理须按上游目录结构另行取得）：

```powershell
blender.exe --background --factory-startup --python rocketbox-convert-fbx-to-glb.py -- --input Female_Adult_02_facial.fbx --texture-dir Textures --output Female_Adult_02_facial.glb --report export-report.json
```

## 已核验的能力与范围

- 转换前：1 个蒙皮网格、80 根骨骼、175 个可用面部 morph target。
- 转换后：3 个 PBR primitive、1 个 skin、80 个 joint、175 个命名 morph target、嵌入式 PNG 贴图、无动画。
- 用途：本项目中的实时 Three.js 人物、表情、眨眼、音频能量驱动口型和上肢姿态控制。
- 不宣称逐音素精确口型；项目实现的是基于真实音频分析的非匀速能量驱动口型。
