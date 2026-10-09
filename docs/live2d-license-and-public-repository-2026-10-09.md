# Live2D Haru 与 Cubism Web 授权核查（2026-10-09）

本文记录本项目的保守合规判断，不构成法律意见。结论只依据核查时可访问的 Live2D 官方页面，不依据项目内旧说明。

## 官方来源

1. [Haru Receptionist 官方样例页](https://www.live2d.com/en/learn/sample/haru-receptionist/)
2. [Live2D Free Material License Agreement](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)（页面标注 Version 1.6，2025-02-03 修订）
3. [Live2D Sample Model Terms](https://www.live2d.com/eula/live2d-sample-model-terms_en.html)（页面标注 Version 1.7，2026-01-29 更新）
4. [Cubism SDK for Web 手册](https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/)
5. [Cubism SDK 发布许可页](https://www.live2d.com/en/sdk/license/)
6. [Cubism SDK 许可概览](https://www.live2d.com/en/sdk/about/)
7. [Cubism SDK for Web 官方下载页](https://www.live2d.com/en/sdk/download/web/)

## 分项核查

| 对象 | 官方信息与本项目判断 |
|---|---|
| Haru Receptionist | 官方页将其列为样例数据，运行时包含 `.moc3`、`.motion3.json`、`.model3.json`、`.physics3.json`、`.cdi3.json` 等。一般用户和小规模企业可在接受 Free Material License 与 Sample Data Terms 后，把样例用于商业或非商业作品。 |
| Free Material License | 条款把将材料放在互联网服务器供第三方访问也纳入 “Redistribute” 的定义，并原则上禁止未经明确许可的再分发。条款允许按适用范围制作、修改和发布“作品”，不等于允许把原始/可提取样例文件作为源码附件再次分发。 |
| Sample Model Terms | Haru Receptionist 属于 Live2D Original Character；使用时应保留官方要求的版权声明，并同时遵守 Free Material License。 |
| Cubism SDK for Web | 官方手册明确区分开源 Framework 与专有 Cubism Core；Core 不在 GitHub 发布，应从官方 SDK 包获取并遵守 Proprietary Software License。 |
| SDK 发布许可 | 个人/小规模企业在部分非 Expandable Application 场景下可能免签约或免许可费；AI/聊天机器人式 Web 应用及可扩展应用需按官方流程图判断，必要时接受特别审查。 |

## 三种使用场景

1. **本次招新考核的本机/受控演示**：属于个人制作的非商业考核展示，按官方样例页所述用途具有较强许可依据，但仍必须遵守署名、角色形象、SDK 和样例条款。
2. **网页向浏览器下发运行资源**：这是运行作品所需的技术分发。官方允许的“发布作品”和禁止“再分发材料”之间存在边界，应确保资源只为运行作品服务，不提供素材下载索引或可复用素材包；如转为公开长期服务或商业服务，应使用官方发布许可流程再次确认。
3. **公开 GitHub/Gitee 源码仓库**：会让第三方直接取得 MOC、纹理、Motion 和 Core，最接近条款中的 Redistribute。现有官方页面不足以确认该方式被明确允许，所以本项目采用保守结论：**不直接提交这些文件**。

## 文件级结论

| 文件 | 公开仓库策略 |
|---|---|
| Haru `.moc3`、纹理、`.model3.json`、`.physics3.json`、`.pose3.json`、`.cdi3.json`、Motion | 不提交；由使用者从官方 Haru 页面下载并接受条款后放入目标目录 |
| `live2dcubismcore.js` | 不提交；由使用者从 Cubism SDK for Web 官方包复制 |
| Cubism Framework 源码 | 可按 Live2D Open Software License 处理，保留原版权与许可头 |
| 本项目自行编写的 TypeScript、FastAPI、Nginx、Docker 文件 | 可按仓库最终选择的项目许可公开 |

`.gitignore` 已排除 `live2d-web/public/Resources/haru_greeter_t05/` 与 `live2d-web/public/Core/live2dcubismcore.js`。本地文件继续用于当前 Docker 验收，但在第 9 项公开推送前必须用 `git status --ignored` 和 `git ls-files` 再确认它们未被跟踪。

## 可复现初始化

README 给出官方下载地址、目标目录和关键 SHA-256。下载并复制官方运行时资源后，在 `live2d-web` 执行：

```powershell
npm ci
npm run assets:prepare
npm run assets:verify
```

Dockerfile 也会执行 `assets:verify`，资源不完整时构建立即失败。由于官方包版本可能更新，README 中的校验和只对应本次本地验收副本；若官方发布新版本，应记录新版本、下载日期和新校验和，不能绕过校验或伪造许可结论。

## 推送前闸门

- 当前阶段不执行公开推送。
- 推送前确认受限文件从未进入 Git 历史；如果已经被提交，不能只靠 `.gitignore`，需要先清理历史或创建不含二进制的新公开仓库。
- 若希望直接把模型/Core 放入公开仓库，应先取得 Live2D 对该具体分发方式的书面许可；在此之前维持“用户自行从官方获取”的方式。
