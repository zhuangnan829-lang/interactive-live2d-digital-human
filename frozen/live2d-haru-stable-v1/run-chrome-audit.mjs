import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = 'C:/Users/a/AppData/Local/Temp/live2d-avatar-audit-20261008';
const evidence = path.join(root, 'evidence', 'chrome-audit');
const profile = path.join(root, 'chrome-profile');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
await mkdir(evidence, { recursive: true });
await mkdir(profile, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1920,1080',
  '--force-device-scale-factor=1',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:5000/'
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeStderr = '';
chrome.stderr.on('data', chunk => { chromeStderr += chunk.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const target = targets.find(item => item.type === 'page' && item.url.includes('localhost:5000'));
      if (target) return target;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not expose the demo page.');
}

const target = await pageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
const consoleEntries = [];
const networkFailures = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') consoleEntries.push({ method: message.method, params: message.params });
  if (message.method === 'Runtime.exceptionThrown') consoleEntries.push({ method: message.method, params: message.params });
  if (message.method === 'Log.entryAdded') consoleEntries.push({ method: message.method, params: message.params });
  if (message.method === 'Network.loadingFailed') networkFailures.push(message.params);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    networkFailures.push({ status: message.params.response.status, url: message.params.response.url });
  }
});

function call(method, params = {}) {
  const callId = ++id;
  ws.send(JSON.stringify({ id: callId, method, params }));
  return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
}

async function evaluate(expression, userGesture = false) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

async function waitFor(expression, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(path.join(evidence, `${name}.png`), Buffer.from(result.data, 'base64'));
}

const snapshots = {};
try {
  await Promise.all([
    call('Page.enable'), call('Runtime.enable'), call('Network.enable'), call('Log.enable')
  ]);
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://localhost:5000/' });
  await waitFor("document.getElementById('status-pill')?.textContent === 'READY'", 30000, 'avatar-ready');
  await sleep(1200);
  snapshots.natural = await evaluate('window.__live2dFunctional');
  await screenshot('01-natural');

  for (const [index, emotion] of ['smile', 'serious', 'doubt'].entries()) {
    await evaluate(`document.querySelector('[data-emotion="${emotion}"]').click()`, true);
    await sleep(1000);
    snapshots[emotion] = await evaluate('window.__live2dFunctional');
    await screenshot(`0${index + 2}-${emotion}`);
  }

  await evaluate("document.querySelector('[data-emotion=\"smile\"]').click()", true);
  await evaluate("document.getElementById('speak').click()", true);
  await waitFor("['SPEAKING','ERROR'].includes(document.getElementById('status-pill')?.textContent)", 30000, 'TTS playback');
  const ttsStatus = await evaluate("document.getElementById('status-pill')?.textContent");
  if (ttsStatus === 'SPEAKING') {
    await sleep(3500);
    snapshots.speaking = await evaluate('window.__live2dFunctional');
    await screenshot('05-speaking');
    await evaluate("document.getElementById('stop').click()", true);
    await sleep(800);
    snapshots.stopped = await evaluate('window.__live2dFunctional');
    await screenshot('06-stopped');
  } else {
    snapshots.ttsError = await evaluate("({ status: document.getElementById('status')?.textContent, audit: window.__live2dFunctional })");
  }

  await waitFor('Boolean(window.__live2dAudit)', 70000, '60-second FPS audit');
  const result = await evaluate(`({
    performance: window.__live2dAudit,
    functional: window.__live2dFunctional,
    status: document.getElementById('status')?.textContent,
    pill: document.getElementById('status-pill')?.textContent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    webgl: (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    })()
  })`);
  await screenshot('07-final-60s');
  await writeFile(path.join(evidence, 'audit-results.json'), JSON.stringify({ result, snapshots, consoleEntries, networkFailures }, null, 2));
  await writeFile(path.join(evidence, 'console.json'), JSON.stringify(consoleEntries, null, 2));
  await writeFile(path.join(evidence, 'network-failures.json'), JSON.stringify(networkFailures, null, 2));
  console.log(JSON.stringify({ result, snapshots, consoleCount: consoleEntries.length, networkFailureCount: networkFailures.length }, null, 2));
} finally {
  ws.close();
  chrome.kill();
  await writeFile(path.join(evidence, 'chrome-stderr.log'), chromeStderr);
}
