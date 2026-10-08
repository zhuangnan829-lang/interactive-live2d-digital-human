import { LAppDelegate } from './lappdelegate';
import { auditState, AuditEmotion } from './auditstate';

let audio: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let objectUrl: string | null = null;
let audioFrame = 0;
let requestId = 0;
let controller: AbortController | null = null;
let performanceAuditStarted = false;

const functionalAudit = {
  statusHistory: [] as string[],
  emotionHistory: ['natural'],
  maxMouth: 0,
  currentMouth: 0,
  stoppedMouth: null as number | null,
  parameterSnapshot: {} as Record<string, number>,
};
(window as Window & { __live2dFunctional?: unknown }).__live2dFunctional = functionalAudit;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(kind: string, message: string): void {
  $('status-pill').textContent = kind.toUpperCase();
  $('status').textContent = message;
  functionalAudit.statusHistory.push(kind);
}

function releasePlayback(): void {
  requestId++;
  controller?.abort();
  controller = null;
  if (audioFrame) cancelAnimationFrame(audioFrame);
  audioFrame = 0;
  audio?.pause();
  if (audio) audio.currentTime = 0;
  audio = null;
  source?.disconnect();
  analyser?.disconnect();
  source = null;
  analyser = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  auditState.mouth = 0;
  functionalAudit.currentMouth = 0;
  $('mouth-meter').textContent = 'Mouth 0.00';
  $('stop').setAttribute('disabled', '');
}

async function speak(): Promise<void> {
  const text = ($<HTMLTextAreaElement>('text').value || '').trim();
  if (!text) return setStatus('empty', '请输入中文讲解内容。');
  releasePlayback();
  const current = ++requestId;
  controller = new AbortController();
  setStatus('loading', '正在调用现有后端生成真实中文语音…');
  $('speak').setAttribute('disabled', '');
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    const blob = await response.blob();
    if (current !== requestId) return;
    objectUrl = URL.createObjectURL(blob);
    audio = new Audio(objectUrl);
    context ??= new AudioContext();
    source = context.createMediaElementSource(audio);
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
    const values = new Uint8Array(analyser.frequencyBinCount);
    let envelope = 0;
    const animateMouth = () => {
      analyser!.getByteTimeDomainData(values);
      let sum = 0;
      for (const value of values) sum += Math.abs(value - 128);
      const target = Math.min(1, Math.max(0, (sum / values.length - 2) / 20));
      envelope += (target - envelope) * (target > envelope ? 0.48 : 0.2);
      auditState.mouth = envelope;
      functionalAudit.currentMouth = envelope;
      functionalAudit.maxMouth = Math.max(functionalAudit.maxMouth, envelope);
      $('mouth-meter').textContent = `Mouth ${envelope.toFixed(2)}`;
      audioFrame = requestAnimationFrame(animateMouth);
    };
    audio.onended = () => {
      if (current !== requestId) return;
      releasePlayback();
      setStatus('ready', '播报完成，嘴型已平滑复位。');
      $('speak').removeAttribute('disabled');
    };
    await context.resume();
    await audio.play();
    if (current !== requestId) return;
    animateMouth();
    $('stop').removeAttribute('disabled');
    setStatus('speaking', '正在播报；ParamMouthOpenY 由真实音频能量驱动。');
  } catch (error) {
    if (current !== requestId || (error instanceof DOMException && error.name === 'AbortError')) return;
    releasePlayback();
    $('speak').removeAttribute('disabled');
    setStatus('error', `语音生成失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

function setupUi(): void {
  $('emotions').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-emotion]');
    if (!button) return;
    auditState.emotion = button.dataset.emotion as AuditEmotion;
    functionalAudit.emotionHistory.push(auditState.emotion);
    document.querySelectorAll('#emotions button').forEach((item) => item.classList.toggle('selected', item === button));
    setStatus('ready', `已切换为${button.textContent}状态；眉眼、嘴角和头部参数实时变化。`);
  });
  const strength = $<HTMLInputElement>('strength');
  strength.addEventListener('input', () => {
    auditState.strength = Number(strength.value);
    $('strength-value').textContent = `${Math.round(auditState.strength * 100)}%`;
  });
  $('speak').addEventListener('click', () => void speak());
  $('stop').addEventListener('click', () => {
    releasePlayback();
    functionalAudit.stoppedMouth = auditState.mouth;
    $('speak').removeAttribute('disabled');
    setStatus('ready', '已立即停止；声音关闭，嘴巴已复位。');
  });
  $('retry').addEventListener('click', () => location.reload());
  window.addEventListener('avatar-ready', () => {
    $('speak').removeAttribute('disabled');
    setStatus('ready', 'Haru Reception 已通过官方 Cubism Web SDK 加载。');
    if (!performanceAuditStarted) {
      performanceAuditStarted = true;
      startPerformanceAudit();
    }
  });
  window.addEventListener('error', (event) => setStatus('error', `加载失败：${event.message}`));
  window.addEventListener('unhandledrejection', (event) => setStatus('error', `加载失败：${String(event.reason)}`));
}

function startPerformanceAudit(): void {
  const started = performance.now();
  let previous = started;
  let secondFrames = 0;
  let totalFrames = 0;
  const samples: number[] = [];
  const tick = (now: number) => {
    secondFrames++;
    totalFrames++;
    if (now - previous >= 1000) {
      const fps = secondFrames * 1000 / (now - previous);
      samples.push(fps);
      $('fps').textContent = `${Math.round(fps)} FPS`;
      secondFrames = 0;
      previous = now;
    }
    if (now - started >= 60000) {
      const average = totalFrames * 1000 / (now - started);
      const result = {
        model: 'Haru Reception / haru_greeter_t05',
        sdk: 'Cubism 5 SDK for Web R5',
        viewport: `${innerWidth}x${innerHeight}`,
        durationMs: Math.round(now - started),
        averageFps: Number(average.toFixed(2)),
        minimumOneSecondFps: Number(Math.min(...samples).toFixed(2)),
        sampleCount: samples.length,
        webgl2: true,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };
      (window as Window & { __live2dAudit?: unknown }).__live2dAudit = result;
      $('sample').textContent = `60秒平均 ${result.averageFps} FPS · 最低秒样本 ${result.minimumOneSecondFps}`;
      localStorage.setItem('live2d.audit.result', JSON.stringify(result));
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

window.addEventListener('load', () => {
  setupUi();
  const webgl2 = document.createElement('canvas').getContext('webgl2');
  if (!webgl2) return setStatus('error', '浏览器不支持 WebGL2。');
  if (!LAppDelegate.getInstance().initialize()) return setStatus('error', 'Cubism WebGL2 初始化失败。');
  LAppDelegate.getInstance().run();
});

window.addEventListener('beforeunload', () => {
  releasePlayback();
  LAppDelegate.releaseInstance();
});
