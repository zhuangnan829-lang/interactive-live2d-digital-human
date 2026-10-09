# Live2D 刷新加载与表情平滑切换（2026-10-09）

## 真实根因

旧优化确实已进入当前 `127.0.0.1:5000` 的源码和运行服务，但浏览器现场复测证明它不稳定：

- 网络缓存命中时，纹理传输只需约 `7–13 ms`；
- `createImageBitmap(WebP)` 却偶发卡在浏览器解码队列 `8.2 s`；
- 改回 PNG 后仍有 `2.7 s`，1024 PNG 高频刷新仍出现 `10.8 s` 异常值；
- 所以 5–8 秒并不是模型 JSON、MOC 或网络下载慢，而是 Chromium 图片解码任务偶发延迟。

另外，窄视口中透明 Live2D Canvas 的层级高于面板，会拦截文本框和表情按钮点击。

## 最终修复

- 保留原 Haru 模型、MOC、物理、Pose 和全部手部 Motion。
- 保留原 2048 PNG，新增同模型 1024 透明纹理作为屏幕渲染资源。
- 增加离线预乘 Alpha 的 `RGBA + gzip` 资源，前端解压后直接 `texImage2D` 上传，绕过浏览器图片解码队列。
- PNG 路径仍作为 `DecompressionStream` 不可用时的兼容回退。
- 纹理完成后立即绘制一帧，不再等可能被降频的下一个 `requestAnimationFrame`。
- Canvas 设为 `pointer-events: none`，不再阻挡文本和表情控件；自动手部动作不变。
- 四种表情用 `0.9 s` Smoothstep 混合，并以 `performance.now()` 计时，不再因低帧率延长到数秒。
- 保留 AudioContext、AnalyserNode、`ParamMouthOpenY` 和现有语义/动作生命周期。

## 当前浏览器实测

| 项目 | 优化前 | 最终优化后 |
|---|---:|---:|
| 真实人物首帧 | 8337 / 8674 ms | 434 / 354 / 398 / 371 / 446 / 386 ms |
| 平均首帧 | 约 8506 ms | 约 398 ms |
| 纹理处理 | 单张可卡 8200–10876 ms | 两张约 54–92 ms |
| 纹理完成到真实绘制 | 可被 RAF 拖延数秒 | 约 4–18 ms |
| 输入框 | 可被 Canvas 拦截 | 刷新后立即聚焦，命中元素为 TEXTAREA/BUTTON |
| 人物持续显示 | 偶发闪现/消失 | 10 秒稳定，Canvas=1，海报层=0 |

最终一轮人物首帧 `386 ms`，两张 RGBA 资源处理 `70 / 74 ms`。微笑、认真、疑惑、自然均使用约 `900 ms` 平滑过渡；手动选择仍保持最高优先级。

机器结果：`evidence/2026-10-09-live2d-cache-emotion/audit-result.json`。
