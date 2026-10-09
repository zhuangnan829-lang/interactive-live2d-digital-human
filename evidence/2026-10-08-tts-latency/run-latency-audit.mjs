import fs from 'node:fs';

const outputDir = new URL('./', import.meta.url);
const endpoint = 'http://127.0.0.1:9225/json';
const pageUrlPart = '127.0.0.1:5000';
const shortText = '欢迎体验我们的交互式数字人系统。';
const longText = '欢迎体验我们的交互式数字人系统。首先，本系统支持实时语音播报、表情切换和智能交互。核心优势在于实时响应和自然表达能力。长文本会按照中文标点分句，优先生成并播放第一句。后续语句在当前语音播放时后台生成，保证句间衔接自然。';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pages;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    pages = await (await fetch(endpoint)).json();
    break;
  } catch {
    await wait(250);
  }
}
const page = pages?.find((item) => item.type === 'page' && item.url.includes(pageUrlPart));
if (!page) throw new Error('Live2D page not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result);
});
function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression, userGesture = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(80);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function capture(fileName) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(new URL(fileName, outputDir), Buffer.from(result.data, 'base64'));
}
async function setTextAndSpeak(text) {
  await evaluate(`(() => {
    const field = document.getElementById('text');
    field.value = ${JSON.stringify(text)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('speak').click();
  })()`, true);
}
async function stop() {
  await evaluate("document.getElementById('stop').click()", true);
  await waitFor("window.__live2dControllers.state.mouth === 0 && window.__live2dFunctional.activeRequests === 0");
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
await waitFor("document.readyState === 'complete' && window.__live2dControllers?.state.ready === true", 30000);

const baseline = await evaluate(`(async () => {
  const started = performance.now();
  const response = await fetch('/api/tts', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({text:${JSON.stringify(longText)}}) });
  const headersAt = performance.now();
  const blob = await response.blob();
  const blobAt = performance.now();
  const url = URL.createObjectURL(blob);
  const probe = new Audio(url);
  await new Promise((resolve, reject) => { probe.addEventListener('canplay', resolve, {once:true}); probe.addEventListener('error', reject, {once:true}); probe.load(); });
  const decodedAt = performance.now();
  URL.revokeObjectURL(url);
  return { textLength: ${longText.length}, responseHeadersMs: headersAt-started, blobCompleteMs: blobAt-started, browserCanPlayMs: decodedAt-started, bytes: blob.size, backendFirstAudioMs: Number(response.headers.get('x-tts-first-audio-ms')), backendCompleteMs: Number(response.headers.get('x-tts-complete-ms')), provider: response.headers.get('x-tts-provider') };
})()`);

await setTextAndSpeak(shortText);
await capture('short-loading-feedback.png');
await waitFor("window.__live2dLatency?.firstMouthMs > 0", 30000);
await capture('short-first-mouth.png');
const short = await evaluate("structuredClone(window.__live2dLatency)");
await stop();

await setTextAndSpeak(longText);
await capture('long-loading-feedback.png');
await waitFor("window.__live2dLatency?.firstMouthMs > 0", 30000);
await capture('long-first-mouth.png');
const longFirst = await evaluate("structuredClone(window.__live2dLatency)");
await waitFor("window.__live2dLatency?.completedMs > 0", 120000);
const longComplete = await evaluate("structuredClone(window.__live2dLatency)");

const lifecycle = [];
for (let round = 1; round <= 10; round++) {
  await setTextAndSpeak(`第${round}次连续停止测试。后续内容不应继续播放。`);
  await waitFor("window.__live2dLatency?.firstSoundMs > 0", 30000);
  await stop();
  lifecycle.push(await evaluate(`({round:${round}, activeRequests:window.__live2dFunctional.activeRequests, mouth:window.__live2dControllers.state.mouth, speechEnergy:window.__live2dControllers.state.speechEnergy, speechCadence:window.__live2dControllers.state.speechCadence, emphasisPulse:window.__live2dControllers.state.emphasisPulse, motionState:window.__live2dControllers.state.motionState, stopDisabled:document.getElementById('stop').disabled})`));
}

const result = { timestamp: new Date().toISOString(), provider: 'edge-tts fallback', baselineFullText: baseline, shortText: short, longTextFirstSound: longFirst, longTextComplete: longComplete, lifecycle };
fs.writeFileSync(new URL('audit-result.json', outputDir), JSON.stringify(result, null, 2));
socket.close();
