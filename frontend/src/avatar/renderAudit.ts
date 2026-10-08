import type { WebGLRenderer } from "three";

// Opt-in evidence only. Ordinary users never see this panel.
export function createRenderAudit(host: HTMLElement, renderer: WebGLRenderer) {
  if (new URLSearchParams(location.search).get("audit") !== "1") return undefined;
  const panel = document.createElement("details");
  panel.style.cssText = "position:absolute;z-index:3;top:76px;left:20px;max-width:440px;background:#102433e8;color:white;padding:10px;font:12px monospace";
  panel.open = true;
  const title = document.createElement("summary");
  title.textContent = "前台渲染验收（60秒）";
  const button = document.createElement("button");
  button.textContent = "开始60秒前台采样";
  const output = document.createElement("pre");
  output.id = "render-audit";
  output.style.cssText = "white-space:pre-wrap;max-height:260px;overflow:auto";
  panel.append(title, button, output);
  host.append(panel);
  let active = false, started = 0, frames = 0, previous = 0, maxGapMs = 0, lastPrint = 0;
  let geometry = "";
  let status = "等待开始", reason = "";
  let result: object | undefined;
  let firstReadyFromNavigationMs: number | undefined;
  const dimensions = () => ({ viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    canvas: [renderer.domElement.width, renderer.domElement.height], rendererDpr: renderer.getPixelRatio() });
  const runtimeMetrics = () => {
    const modelResource = performance.getEntriesByType("resource")
      .filter((entry) => entry.name.endsWith(".glb"))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return { url: resource.name, durationMs: resource.duration, transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize, decodedBodySize: resource.decodedBodySize };
      });
    const memory = (performance as Performance & { memory?: {
      usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number;
    } }).memory;
    return { firstReadyFromNavigationMs, modelResource, jsHeap: memory ? { usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null };
  };
  const invalidate = () => {
    if (!active) return;
    active = false;
    status = "无效";
    reason = "采样期间失焦、隐藏或尺寸变化；请重新开始完整60秒";
    output.textContent = JSON.stringify({ status, reason, frames }, null, 2);
  };
  const visibility = () => { if (document.visibilityState !== "visible") invalidate(); };
  window.addEventListener("blur", invalidate);
  window.addEventListener("resize", invalidate);
  document.addEventListener("visibilitychange", visibility);
  button.onclick = () => {
    active = true; started = 0; frames = 0; previous = 0; maxGapMs = 0; lastPrint = 0;
    geometry = JSON.stringify(dimensions()); status = "等待模型就绪"; reason = ""; result = undefined;
  };
  return {
    frame(now: number, ready: boolean, mouth: number, emotion: string) {
      if (ready && firstReadyFromNavigationMs === undefined) firstReadyFromNavigationMs = now;
      if (active && (!document.hasFocus() || document.visibilityState !== "visible" || geometry !== JSON.stringify(dimensions()))) invalidate();
      if (active && ready) {
        if (!started) { started = now; previous = now; status = "采样中"; }
        else { frames++; maxGapMs = Math.max(maxGapMs, now - previous); previous = now; }
        if (now - started >= 60000) {
          active = false; status = "完成";
          result = { durationMs: now - started, frames, averageFps: frames * 1000 / (now - started), maxGapMs,
            ...dimensions(), userAgent: navigator.userAgent, visible: true, focused: true,
            ...runtimeMetrics(), completedAt: new Date().toISOString(),
            method: "renderer.render 后计数；失焦/隐藏/尺寸变化立即作废；Resource Timing 记录模型加载" };
        }
      }
      if (now - lastPrint >= 200) {
        lastPrint = now;
        output.textContent = JSON.stringify({ status, reason, elapsedSeconds: started ? (previous - started) / 1000 : 0,
          frames, mouth, emotion, focused: document.hasFocus(), visibility: document.visibilityState,
          runtime: runtimeMetrics(), result }, null, 2);
      }
    },
    dispose() {
      window.removeEventListener("blur", invalidate);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("visibilitychange", visibility);
      panel.remove();
    },
  };
}
