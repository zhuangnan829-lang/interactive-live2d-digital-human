# Live2D 刷新加载优化（2026-10-08）

## 根因

人物空白不是模型损坏，而是旧加载链路将首帧绘制阻塞在两个步骤之后：

1. 等待 `window.load`，使 Cubism 初始化被页面图片加载阻塞。
2. 必须先完整预加载 27 个动作文件，之后才开始请求两张 2048 纹理。

优化前实测首帧为 `1397.9 ms`，其中纹理直到 `326.8 ms` 才开始请求，在 `1386.6 ms` 才完成。

## 修复

- 在 HTML `head` 中提前预取 model3.json、MOC3 和两张纹理。
- 将应用启动点从 `window.load` 前移到 `DOMContentLoaded`。
- 纹理与全部原始动作改为并行加载；首帧只等待模型和纹理。
- 动作后台预加载期间禁止每帧重复请求同一动作。
- 增加 `data-avatar-load` 阶段时间戳，可直接机器验收。

## 实测结果

| 项目 | 优化前 | 优化后 |
|---|---:|---:|
| 人物首帧 | 1397.9 ms | 254.9 ms（3 次平均） |
| 纹理开始 | 326.8 ms | 131–172 ms |
| 完整动作加载 | 326.2 ms | 289–326 ms（后台） |
| 首帧缩短 | - | 81.8% |

三次刷新的人物首帧分别为 `251.2 ms`、`235.5 ms`、`277.9 ms`。

## 回归验证

- 没有更换 Live2D 模型或纹理。
- 27 个原始动作全部加载，手部动作保留。
- 自然表情保持正常。
- TTS 回归首声 `152.0 ms`，首次有效口型 `729.1 ms`。
- `AudioContext → AnalyserNode → ParamMouthOpenY` 保持不变。

## 刷新后 4–5 秒视觉空白追加修复（2026-10-09）

进一步实测发现，Live2D 真实首帧在导航后约 `509.2 ms` 已就绪，但浏览器的刷新呈现和计时回调在当前场景中被延后到约 `4309.4 ms`，造成了用户看到的 4–5 秒空白。

现在每次动态模型绘制后会保存一张来自真实 WebGL 画布的人物帧（本次约 `64 KB`）。后续刷新时在导航后约 `224.5 ms` 先恢复这张真实人物画面，动态 WebGL 就绪后通过 `160 ms` 透明度过渡无缝接管。

快照不替换模型，不参与播放、表情、动作或口型计算；它只用于消除刷新空白。实测运行帧率为 `80 FPS`。

## 刷新后输入框阻塞修复（2026-10-09）

首帧快照的第一版实现使用了同步 `canvas.toDataURL()` 和 `localStorage.setItem()`。大尺寸 WebGL 画布在主线程编码时，会阻塞鼠标点击和键盘输入，这就是“人物已经出现，但输入框还要等 4–5 秒”的直接原因。

现在改为：

- 人物就绪后立即完成快照层交接，不等待编码。
- 通过 `requestIdleCallback` 在空闲阶段调度 `canvas.toBlob()`。
- 通过 Cache Storage 异步保存 Blob，不再同步写入 base64 `localStorage`。
- 旧版 `live2d.avatar.poster.v1` 数据在新快照成功后自动清理。

真实刷新测试中，控件在导航后 `223.6 ms` 已初始化；在第 `500 ms` 请求聚焦输入框，实际仅产生 `63.1 ms` 事件循环偏差，聚焦成功。快照以约 `48 KB` Blob 在后台完成，不影响输入。

验收证据：

- `evidence/2026-10-08-live2d-loading/audit-result.json`
- `evidence/2026-10-08-live2d-loading/before-refresh-blank.png`
- `evidence/2026-10-08-live2d-loading/after-model-visible.png`
- `evidence/2026-10-09-live2d-refresh-cache/audit-result.json`
- `evidence/2026-10-09-live2d-refresh-cache/avatar-visible.png`
- `evidence/2026-10-09-input-responsiveness/audit-result.json`

## 最终稳定方案：移除快照交接竞态（2026-10-09）

后续连续刷新发现，异步快照虽然不再阻塞输入，但“快照图层淡出”与真实 WebGL 首帧仍可能竞争：快照先出现并闪动，随后被隐藏时，真实画布若正处于尺寸初始化或重绘间隙，人物会短暂或持续消失。因此最终版本不再使用人物快照层、`preserveDrawingBuffer`、Canvas 编码或 Cache Storage；页面只显示真实 Live2D Canvas。

同时把原先一次启动全部并行解析的 27 个动作改为：

- 模型与纹理优先完成真实首帧；
- 开场动作、手部过渡动作和其余原动作按优先级在空闲片段逐个加载；
- 每个动作之间保留 `160 ms` 交互窗口；
- 固定的本地 `motion3.json` 不再每次刷新重复执行曲线一致性遍历，但正常解析和全部动作均保留；
- 文本框使用原生 `autofocus`，在 Live2D 初始化之前即可直接输入。

最终正式地址实测：

| 检查项 | 结果 |
|---|---:|
| 真实 Live2D 首帧 | 355.2 ms |
| 刷新后直接输入 10 个中文字符 | 85 ms |
| 10 秒持续显示 | 通过 |
| Canvas 实例数 | 1 |
| 快照/海报图层数 | 0 |
| 27 个原动作 | 全部后台完成，手部动作保留 |

此前的 `2026-10-09-live2d-refresh-cache` 和 `2026-10-09-input-responsiveness` 记录保留为问题演进历史；最终验收以 `evidence/2026-10-09-live2d-stable-refresh/audit-result.json` 及本轮浏览器截图为准。
