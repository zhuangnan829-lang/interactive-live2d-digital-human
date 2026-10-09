import fs from 'node:fs';

const outputDir = new URL('./', import.meta.url);
const endpoint = 'http://127.0.0.1:9224/json';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let pages;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    pages = await (await fetch(endpoint)).json();
    break;
  } catch {
    await wait(250);
  }
}
const page = pages?.find((item) => item.type === 'page' && item.url.includes('127.0.0.1:5002'));
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
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(100);
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
await send('Emulation.setDeviceMetricsOverride', {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.reload', { ignoreCache: true });
await wait(1500);
await waitFor("document.readyState === 'complete' && !!document.getElementById('text') && window.__live2dControllers?.state.ready === true", 20000);

const cases = [
  ['welcome-smile.png', '欢迎体验我们的交互式数字人系统。', 'smile', 'speaking'],
  ['natural-speaking.png', '本系统支持实时语音播报、表情切换和智能交互。', 'natural', 'speaking'],
  ['serious-emphasis.png', '核心优势在于实时响应和自然表达能力。', 'serious', 'emphasis'],
];

const results = [];
for (const [fileName, text, emotion, motion] of cases) {
  await setTextAndSpeak(text);
  await waitFor(`(window.__live2dControllers.state.emotion === '${emotion}' && !document.getElementById('stop').disabled) || document.getElementById('status-pill')?.textContent === 'ERROR'`, 30000);
  const observed = await evaluate("({emotion: window.__live2dControllers.state.emotion, motion: window.__live2dControllers.state.motionState, status: document.getElementById('status-pill')?.textContent, message: document.getElementById('status')?.textContent})");
  const validMotion = motion === 'emphasis'
    ? observed.motion === 'emphasis'
    : observed.motion === 'speaking' || observed.motion === 'emphasis';
  if (observed.emotion !== emotion || !validMotion) {
    throw new Error(`Unexpected runtime state: ${JSON.stringify(observed)}`);
  }
  await wait(500);
  const state = await evaluate("({...window.__live2dControllers.state, audit: window.__live2dFunctional.parameterSnapshot})");
  await capture(fileName);
  results.push({ text, expectedEmotion: emotion, expectedMotion: motion, state });
  await stop();
  await wait(700);
}

const lifecycle = [];
for (let round = 1; round <= 10; round++) {
  await setTextAndSpeak(`第${round}次连续播报测试，系统保持声音、口型和动作同步。`);
  await waitFor("!document.getElementById('stop').disabled", 15000);
  lifecycle.push(await evaluate(`({
    round: ${round},
    activeRequests: window.__live2dFunctional.activeRequests,
    motionState: window.__live2dControllers.state.motionState,
    mouth: window.__live2dControllers.state.mouth
  })`));
  await stop();
}

await evaluate("document.querySelector('[data-emotion=smile]').click()", true);
await setTextAndSpeak('核心内容需要重点说明。');
await waitFor("window.__live2dFunctional.activeRequests === 1");
const manualOverride = await evaluate("({emotion: window.__live2dControllers.state.emotion, source: window.__live2dControllers.state.emotionSource})");
await stop();

await wait(800);
const finalState = await evaluate("({state: {...window.__live2dControllers.state}, audit: window.__live2dFunctional})");
fs.writeFileSync(new URL('audit-result.json', outputDir), JSON.stringify({ results, lifecycle, manualOverride, finalState }, null, 2));
await send('Browser.close');
