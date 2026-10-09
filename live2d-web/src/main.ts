import { LAppDelegate } from './lappdelegate';
import { auditState, AuditEmotion, DEFAULT_EXPRESSION_STRENGTH, resetAvatarLoadAudit } from './auditstate';
import { EmotionController } from './emotioncontroller';
import { MotionController } from './motioncontroller';
import { analyzeSpeechText, buildSpeechTimeline, SpeechAnalyzer, SpeechTimeline, TextAnalysis } from './speechanalyzer';

let audio: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let objectUrl: string | null = null;
let audioFrame = 0;
let requestId = 0;
const controllers = new Set<AbortController>();
let performanceAuditStarted = false;
let currentAnalysis: TextAnalysis | null = null;
let queuedObjectUrls: string[] = [];
let playbackCancelled: (() => void) | null = null;
let resumePlayback: (() => Promise<void>) | null = null;
let pausedByUser = false;
let activePlaybackText = '';
let playbackTextOffset = 0;
let activeSegmentOffset = 0;
let activeSegmentLength = 0;
let activeSegmentEstimatedDuration = 1;
let pausedSourceText = '';
let pausedSourceOffset = 0;
let prewarmTimer = 0;
let prewarmText = '';
let prewarmAccepted: Promise<void> | null = null;

type LatencyStage = {
  index: number;
  text: string;
  transport?: 'stream' | 'blob-fallback';
  requestId?: string;
  provider?: string;
  clickToFetchMs?: number;
  networkToBackendMs?: number;
  backendFirstAudioMs?: number;
  backendCompleteMs?: number;
  responseHeadersMs?: number;
  blobCompleteMs?: number;
  blobDurationMs?: number;
  blobBytes?: number;
  audioContextResumeMs?: number;
  playCalledMs?: number;
  playingMs?: number;
  firstMouthMs?: number;
};

type LatencyAudit = {
  sessionId: number;
  text: string;
  segments: string[];
  clickedEpochMs: number;
  clickedAt: number;
  statusFeedbackMs: number;
  audioContextResumeMs?: number;
  firstSoundMs?: number;
  firstMouthMs?: number;
  completedMs?: number;
  cancelled: boolean;
  stages: LatencyStage[];
};

let latencyAudit: LatencyAudit | null = null;
const ttsClientId = crypto.randomUUID();
const SETTINGS_KEY = 'live2d.presentation.settings.v1';
const VALID_EMOTIONS = new Set<AuditEmotion>(['natural', 'smile', 'serious', 'curious']);
let avatarRestarting = false;

const emotionController = new EmotionController();
const motionController = new MotionController();
const speechAnalyzer = new SpeechAnalyzer();

const functionalAudit = {
  statusHistory: [] as string[],
  emotionHistory: ['natural'],
  semanticHistory: [] as TextAnalysis[],
  motionHistory: ['idle'],
  maxMouth: 0,
  currentMouth: 0,
  stoppedMouth: null as number | null,
  parameterSnapshot: {} as Record<string, number>,
  emotionSource: 'auto',
  activeRequests: 0,
  timelineHistory: [] as Array<{ segment: number; timeline: SpeechTimeline }>,
};
(window as Window & { __live2dFunctional?: unknown }).__live2dFunctional = functionalAudit;
(window as Window & { __live2dLatency?: unknown }).__live2dLatency = null;
(window as Window & { __live2dControllers?: unknown }).__live2dControllers = {
  analyzeText: analyzeSpeechText,
  buildTimeline: buildSpeechTimeline,
  state: auditState,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type SavedPresentationSettings = {
  emotion: AuditEmotion;
  strength: number;
};

function loadPresentationSettings(): SavedPresentationSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<SavedPresentationSettings>;
    const emotion = VALID_EMOTIONS.has(value.emotion as AuditEmotion)
      ? value.emotion as AuditEmotion
      : 'natural';
    const strength = Number(value.strength);
    return {
      emotion,
      strength: Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : DEFAULT_EXPRESSION_STRENGTH,
    };
  } catch {
    return { emotion: 'natural', strength: DEFAULT_EXPRESSION_STRENGTH };
  }
}

function savePresentationSettings(): void {
  const settings: SavedPresentationSettings = {
    emotion: auditState.emotion,
    strength: auditState.baseExpressionStrength,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setStatus(kind: string, message: string): void {
  $('status-pill').textContent = kind.toUpperCase();
  $('status').textContent = message;
  functionalAudit.statusHistory.push(kind);
}

function setSpeakLabel(label: '开始播报' | '继续播报' | '重新生成'): void {
  const button = $<HTMLButtonElement>('speak');
  const icon = button.querySelector('.button-icon');
  button.replaceChildren();
  if (icon) button.append(icon);
  button.append(label);
}

function recordMotionState(): void {
  const last = functionalAudit.motionHistory[functionalAudit.motionHistory.length - 1];
  if (last !== auditState.motionState) functionalAudit.motionHistory.push(auditState.motionState);
}

function markLatency(name: string, detail?: unknown): void {
  performance.mark(`tts:${name}`, { detail });
}

function publishLatency(): void {
  (window as Window & { __live2dLatency?: unknown }).__live2dLatency = latencyAudit;
  if (latencyAudit) document.documentElement.dataset.ttsLatency = JSON.stringify(latencyAudit);
}

function splitSpeechText(text: string, maxLength = 72): string[] {
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  const result: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      result.push(sentence);
      continue;
    }
    let remaining = sentence;
    while (remaining.length > maxLength) {
      const windowText = remaining.slice(0, maxLength + 1);
      const splitAt = Math.max(windowText.lastIndexOf('，'), windowText.lastIndexOf(','), windowText.lastIndexOf('、'));
      const index = splitAt >= Math.floor(maxLength * 0.45) ? splitAt + 1 : maxLength;
      result.push(remaining.slice(0, index).trim());
      remaining = remaining.slice(index).trim();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}

function locateSegments(text: string, segments: string[]): number[] {
  let searchFrom = 0;
  return segments.map((segment) => {
    const foundAt = text.indexOf(segment, searchFrom);
    const offset = foundAt >= 0 ? foundAt : searchFrom;
    searchFrom = offset + segment.length;
    return offset;
  });
}

function remapTextOffset(original: string, updated: string, originalOffset: number): number {
  const safeOffset = Math.min(original.length, Math.max(0, originalOffset));
  let prefix = 0;
  while (prefix < original.length && prefix < updated.length && original[prefix] === updated[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < updated.length - prefix &&
    original[original.length - 1 - suffix] === updated[updated.length - 1 - suffix]
  ) suffix++;

  if (safeOffset <= prefix) return safeOffset;
  if (safeOffset >= original.length - suffix) {
    return Math.max(prefix, updated.length - (original.length - safeOffset));
  }

  // If the pause falls inside the edited span there is no reliable one-to-one
  // character mapping. Restart at the beginning of that changed span so a new
  // word or phrase is never spoken from its middle.
  return prefix;
}

function remainingTextFromOffset(text: string, offset: number): string {
  return text
    .slice(Math.min(text.length, Math.max(0, offset)))
    .replace(/^[\s，。！？；、,.!?;:：]+/, '')
    .trim();
}

function beginSpeechPrewarm(firstSegment: string): Promise<void> {
  prewarmText = firstSegment;
  const accepted = fetch('/api/tts/prewarm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tts-client-id': ttsClientId },
    body: JSON.stringify({ text: firstSegment }),
  }).then((response) => {
    if (!response.ok) throw new Error(`TTS prewarm HTTP ${response.status}`);
  }).catch(() => {
    if (prewarmText === firstSegment) prewarmText = '';
  });
  prewarmAccepted = accepted;
  return accepted;
}

function ensureSpeechPrewarm(firstSegment: string): Promise<void> {
  if (prewarmTimer) {
    window.clearTimeout(prewarmTimer);
    prewarmTimer = 0;
  }
  if (prewarmText === firstSegment && prewarmAccepted) return prewarmAccepted;
  return beginSpeechPrewarm(firstSegment);
}

function scheduleSpeechPrewarm(delayMs = 80, textOverride?: string): void {
  if (prewarmTimer) window.clearTimeout(prewarmTimer);
  const text = (textOverride ?? $<HTMLTextAreaElement>('text').value ?? '').trim();
  const firstSegment = text ? splitSpeechText(text)[0] : '';
  if (!firstSegment || firstSegment === prewarmText) return;
  prewarmTimer = window.setTimeout(() => {
    prewarmTimer = 0;
    void beginSpeechPrewarm(firstSegment);
  }, delayMs);
}

async function resumeAudioContext(clickedAt: number): Promise<AudioContext> {
  context ??= new AudioContext();
  const started = performance.now();
  markLatency('audio-context-resume-start');
  await context.resume();
  const elapsed = performance.now() - clickedAt;
  markLatency('audio-context-resumed', { durationMs: performance.now() - started, clickToResumeMs: elapsed });
  if (latencyAudit) {
    latencyAudit.audioContextResumeMs = elapsed;
    publishLatency();
  }
  return context;
}

async function fetchSpeechSegment(text: string, index: number, session: number, clickedAt: number): Promise<{ blob: Blob; timing: LatencyStage }> {
  const abortController = new AbortController();
  controllers.add(abortController);
  functionalAudit.activeRequests = 1;
  const fetchStarted = performance.now();
  const fetchEpochMs = Date.now();
  markLatency(`segment-${index}-fetch-start`, { textLength: text.length });
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tts-client-id': ttsClientId },
      body: JSON.stringify({ text }),
      signal: abortController.signal,
    });
    const responseHeadersAt = performance.now();
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `TTS HTTP ${response.status}`);
    }
    const blobStarted = performance.now();
    const blob = await response.blob();
    const blobCompleted = performance.now();
    if (session !== requestId) throw new DOMException('过期请求', 'AbortError');
    const receivedEpoch = Number(response.headers.get('x-tts-received-epoch-ms'));
    const timing: LatencyStage = {
      index,
      text,
      transport: 'blob-fallback',
      requestId: response.headers.get('x-tts-request-id') ?? undefined,
      provider: response.headers.get('x-tts-provider') ?? undefined,
      clickToFetchMs: fetchStarted - clickedAt,
      networkToBackendMs: Number.isFinite(receivedEpoch) ? Math.max(0, receivedEpoch - fetchEpochMs) : undefined,
      backendFirstAudioMs: Number(response.headers.get('x-tts-first-audio-ms')) || undefined,
      backendCompleteMs: Number(response.headers.get('x-tts-complete-ms')) || undefined,
      responseHeadersMs: responseHeadersAt - clickedAt,
      blobCompleteMs: blobCompleted - clickedAt,
      blobDurationMs: blobCompleted - blobStarted,
      blobBytes: blob.size,
    };
    markLatency(`segment-${index}-blob-complete`, timing);
    return { blob, timing };
  } finally {
    controllers.delete(abortController);
    functionalAudit.activeRequests = session === requestId ? 1 : 0;
  }
}

function releasePlayback(resetImmediately = false, cancelBackend = false): void {
  requestId++;
  pausedByUser = false;
  resumePlayback = null;
  activePlaybackText = '';
  playbackTextOffset = 0;
  activeSegmentOffset = 0;
  activeSegmentLength = 0;
  activeSegmentEstimatedDuration = 1;
  pausedSourceText = '';
  pausedSourceOffset = 0;
  playbackCancelled?.();
  playbackCancelled = null;
  controllers.forEach((item) => item.abort());
  controllers.clear();
  if (cancelBackend) {
    void fetch('/api/tts/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: ttsClientId }),
      keepalive: true,
    }).catch((_error: unknown): void => undefined);
  }
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
  queuedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  queuedObjectUrls = [];
  auditState.mouth = 0;
  speechAnalyzer.reset();
  resetImmediately ? motionController.reset() : motionController.finish();
  emotionController.finishSpeech();
  currentAnalysis = null;
  functionalAudit.activeRequests = 0;
  functionalAudit.currentMouth = 0;
  recordMotionState();
  $('mouth-meter').textContent = 'Mouth 0.00';
  $('stop').setAttribute('disabled', '');
  document.documentElement.dataset.live2dRuntime = JSON.stringify({
    activeRequests: functionalAudit.activeRequests,
    mouth: auditState.mouth,
    speechEnergy: auditState.speechEnergy,
    speechIntensity: auditState.speechIntensity,
    speechPaused: auditState.speechPaused,
    energyPeak: auditState.energyPeak,
    gesturePulse: auditState.gesturePulse,
    gestureType: auditState.gestureType,
    speechCadence: auditState.speechCadence,
    emphasisPulse: auditState.emphasisPulse,
    motionState: auditState.motionState,
    playbackProgress: auditState.playbackProgress,
    activeCueIndex: auditState.activeCueIndex,
    activeCueType: auditState.activeCueType,
    semanticAction: auditState.semanticAction,
    semanticExpression: auditState.semanticExpression,
    semanticGesture: auditState.semanticGesture,
    semanticHead: auditState.semanticHead,
  });
  document.documentElement.dataset.speechAnalysis = JSON.stringify({
    speaking: false,
    paused: false,
    energy: 0,
    intensity: 0,
    expressionStrength: Number(auditState.expressionStrength.toFixed(3)),
    peak: 0,
    gesture: 'none',
    gesturePulse: 0,
  });
}

async function speak(textOverride?: string): Promise<void> {
  if (pausedByUser && resumePlayback) {
    const updatedText = ($<HTMLTextAreaElement>('text').value || '').trim();
    if (updatedText !== pausedSourceText) {
      const mappedOffset = remapTextOffset(pausedSourceText, updatedText, pausedSourceOffset);
      const remainingText = remainingTextFromOffset(updatedText, mappedOffset);
      document.documentElement.dataset.playbackResume = JSON.stringify({
        mode: 'edited-text',
        originalOffset: pausedSourceOffset,
        mappedOffset,
        originalLength: pausedSourceText.length,
        updatedLength: updatedText.length,
        remainingLength: remainingText.length,
      });
      releasePlayback(true, true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!remainingText) {
        $('speak').removeAttribute('disabled');
        setSpeakLabel('开始播报');
        setStatus('ready', '修改后的内容在原暂停位置之后已无剩余文本。');
        return;
      }
      await speak(remainingText);
      return;
    }

    document.documentElement.dataset.playbackResume = JSON.stringify({
      mode: 'same-text',
      originalOffset: pausedSourceOffset,
    });
    $('speak').setAttribute('disabled', '');
    try {
      await resumePlayback();
    } catch (error) {
      releasePlayback(true, true);
      $('speak').removeAttribute('disabled');
      setSpeakLabel('重新生成');
      setStatus('error', `继续播放失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
    return;
  }

  const text = (textOverride ?? $<HTMLTextAreaElement>('text').value ?? '').trim();
  if (!text) return setStatus('empty', '请输入中文讲解内容。');

  if (latencyAudit && !latencyAudit.completedMs) latencyAudit.cancelled = true;
  releasePlayback(true);
  currentAnalysis = analyzeSpeechText(text);
  functionalAudit.semanticHistory.push(currentAnalysis);
  const resolvedEmotion = emotionController.beginSpeech(currentAnalysis);
  functionalAudit.emotionHistory.push(resolvedEmotion);
  functionalAudit.emotionSource = auditState.emotionSource;

  const current = ++requestId;
  const clickedAt = performance.now();
  const clickedEpochMs = Date.now();
  const segments = splitSpeechText(text);
  const segmentOffsets = locateSegments(text, segments);
  activePlaybackText = text;
  playbackTextOffset = 0;
  const prewarmReady = ensureSpeechPrewarm(segments[0]);
  performance.clearMarks();
  performance.clearMeasures();
  markLatency('click', { textLength: text.length, segmentCount: segments.length });
  latencyAudit = {
    sessionId: current,
    text,
    segments,
    clickedEpochMs,
    clickedAt,
    statusFeedbackMs: 0,
    cancelled: false,
    stages: [],
  };
  functionalAudit.activeRequests = 1;
  publishLatency();
  setSpeakLabel('开始播报');
  setStatus('loading', `正在生成语音（首句优先，0/${segments.length}）；已识别为${currentAnalysis.reason}。`);
  latencyAudit.statusFeedbackMs = performance.now() - clickedAt;
  markLatency('feedback-visible', { clickToFeedbackMs: latencyAudit.statusFeedbackMs });
  $('speak').setAttribute('disabled', '');
  $('stop').removeAttribute('disabled');

  try {
    const contextPromise = resumeAudioContext(clickedAt);
    await prewarmReady;
    let nextSegment: Promise<{ blob: Blob; timing: LatencyStage }> | null = null;

    const playAudioUrl = async (
      url: string,
      timing: LatencyStage,
      index: number,
      revokeUrl: boolean,
      onPlaying?: () => void,
    ): Promise<void> => {
      if (current !== requestId) throw new DOMException('过期请求', 'AbortError');
      audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      const activeContext = await contextPromise;
      source = activeContext.createMediaElementSource(audio);
      analyser = activeContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(activeContext.destination);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const segmentAnalysis = analyzeSpeechText(timing.text);
      const timeline = buildSpeechTimeline(timing.text);
      activeSegmentOffset = segmentOffsets[index] ?? 0;
      activeSegmentLength = timing.text.length;
      activeSegmentEstimatedDuration = timeline.estimatedDuration;
      let envelope = 0;
      let mouthRecorded = false;

      const animateMouth = () => {
        if (!analyser || current !== requestId) return;
        analyser.getByteTimeDomainData(values);
        let sum = 0;
        let squareSum = 0;
        for (const value of values) {
          sum += Math.abs(value - 128);
          const normalized = (value - 128) / 128;
          squareSum += normalized * normalized;
        }
        const target = Math.min(1, Math.max(0, (sum / values.length - 2) / 20));
        const rms = Math.sqrt(squareSum / values.length);
        const speechEnergy = Math.min(1, Math.max(0, (rms - 0.012) / 0.18));
        envelope += (target - envelope) * (target > envelope ? 0.48 : 0.2);
        auditState.mouth = envelope;
        const duration = audio?.duration ?? Number.NaN;
        const currentTime = audio?.currentTime ?? 0;
        const playbackProgress = Number.isFinite(duration) && duration > 0
          ? currentTime / duration
          : currentTime / timeline.estimatedDuration;
        playbackTextOffset = Math.min(
          activePlaybackText.length,
          activeSegmentOffset + Math.round(activeSegmentLength * Math.min(1, Math.max(0, playbackProgress)))
        );
        motionController.update(
          speechAnalyzer.update(speechEnergy, performance.now()),
          Math.min(1, Math.max(0, playbackProgress))
        );
        emotionController.syncSemanticCue(auditState.activeCueType);
        document.documentElement.dataset.speechAnalysis = JSON.stringify({
          speaking: auditState.speaking,
          paused: auditState.speechPaused,
          energy: Number(auditState.speechEnergy.toFixed(3)),
          intensity: Number(auditState.speechIntensity.toFixed(3)),
          expressionStrength: Number(auditState.expressionStrength.toFixed(3)),
          peak: Number(auditState.energyPeak.toFixed(3)),
          gesture: auditState.gestureType,
          semanticAction: auditState.semanticAction,
          gesturePulse: Number(auditState.gesturePulse.toFixed(3)),
        });
        recordMotionState();
        functionalAudit.currentMouth = envelope;
        functionalAudit.maxMouth = Math.max(functionalAudit.maxMouth, envelope);
        $('mouth-meter').textContent = `Mouth ${envelope.toFixed(2)}`;
        if (!mouthRecorded && envelope >= 0.03) {
          mouthRecorded = true;
          timing.firstMouthMs = performance.now() - clickedAt;
          markLatency(`segment-${index}-first-mouth`, { clickToFirstMouthMs: timing.firstMouthMs });
          if (index === 0 && latencyAudit) latencyAudit.firstMouthMs = timing.firstMouthMs;
          publishLatency();
        }
        audioFrame = requestAnimationFrame(animateMouth);
      };

      resumePlayback = async () => {
        if (!audio || current !== requestId) throw new DOMException('过期请求', 'AbortError');
        pausedByUser = false;
        await contextPromise;
        await audio.play();
        motionController.resume();
        animateMouth();
        setSpeakLabel('开始播报');
        setStatus('speaking', `继续播报第 ${index + 1}/${segments.length} 句；已从暂停位置恢复。`);
        $('speak').setAttribute('disabled', '');
        $('stop').removeAttribute('disabled');
      };

      const ended = new Promise<void>((resolve, reject) => {
        playbackCancelled = resolve;
        audio!.addEventListener('ended', () => resolve(), { once: true });
        audio!.addEventListener('error', () => reject(new Error('浏览器无法解码 TTS 音频')), { once: true });
      });
      const playing = new Promise<void>((resolve) => audio!.addEventListener('playing', () => resolve(), { once: true }));
      timing.audioContextResumeMs = latencyAudit?.audioContextResumeMs;
      timing.playCalledMs = performance.now() - clickedAt;
      markLatency(`segment-${index}-play-called`);
      try {
        await audio.play();
        await playing;
        timing.playingMs = performance.now() - clickedAt;
        markLatency(`segment-${index}-playing`, { clickToPlayingMs: timing.playingMs });
        if (index === 0 && latencyAudit) latencyAudit.firstSoundMs = timing.playingMs;
        publishLatency();
        motionController.start(segmentAnalysis, timeline);
        functionalAudit.timelineHistory.push({ segment: index, timeline });
        recordMotionState();
        animateMouth();
        onPlaying?.();
        setStatus('speaking', `正在播报第 ${index + 1}/${segments.length} 句；口型、表情与肢体节奏同步。`);
        await ended;
        playbackTextOffset = Math.min(activePlaybackText.length, activeSegmentOffset + activeSegmentLength);
      } finally {
        pausedByUser = false;
        resumePlayback = null;
        playbackCancelled = null;
        if (audioFrame) cancelAnimationFrame(audioFrame);
        audioFrame = 0;
        audio?.pause();
        if (audio) {
          audio.removeAttribute('src');
          audio.load();
        }
        audio = null;
        source?.disconnect();
        analyser?.disconnect();
        source = null;
        analyser = null;
        if (revokeUrl) {
          URL.revokeObjectURL(url);
          queuedObjectUrls = queuedObjectUrls.filter((item) => item !== url);
        }
        objectUrl = null;
        auditState.mouth = 0;
        motionController.pause();
        functionalAudit.currentMouth = 0;
        $('mouth-meter').textContent = 'Mouth 0.00';
      }
    };

    const playSegment = async (blob: Blob, timing: LatencyStage, index: number): Promise<void> => {
      objectUrl = URL.createObjectURL(blob);
      queuedObjectUrls.push(objectUrl);
      await playAudioUrl(objectUrl, timing, index, true);
    };

    const streamTiming: LatencyStage = {
      index: 0,
      text: segments[0],
      transport: 'stream',
      clickToFetchMs: performance.now() - clickedAt,
    };
    if (latencyAudit) latencyAudit.stages.push(streamTiming);
    publishLatency();
    const streamUrl = new URL('/api/tts/stream', location.href);
    streamUrl.searchParams.set('text', segments[0]);
    streamUrl.searchParams.set('client_id', ttsClientId);

    try {
      await playAudioUrl(streamUrl.toString(), streamTiming, 0, false, () => {
        if (segments.length > 1 && !nextSegment) {
          nextSegment = fetchSpeechSegment(segments[1], 1, current, clickedAt);
        }
      });
    } catch (streamError) {
      if (current !== requestId) throw new DOMException('过期请求', 'AbortError');
      setStatus('loading', '流式语音暂不可用，正在切换兼容回退。');
      const fallback = await fetchSpeechSegment(segments[0], 0, current, clickedAt);
      if (latencyAudit) latencyAudit.stages[0] = fallback.timing;
      publishLatency();
      await playSegment(fallback.blob, fallback.timing, 0);
      if (segments.length > 1) {
        nextSegment = fetchSpeechSegment(segments[1], 1, current, clickedAt);
      }
      console.warn('首句流式播放已回退', streamError);
    }

    for (let index = 1; index < segments.length; index++) {
      nextSegment ??= fetchSpeechSegment(segments[index], index, current, clickedAt);
      const fetched = await nextSegment;
      if (latencyAudit) latencyAudit.stages.push(fetched.timing);
      publishLatency();
      if (index + 1 < segments.length) {
        nextSegment = fetchSpeechSegment(segments[index + 1], index + 1, current, clickedAt);
      } else {
        nextSegment = null;
      }
      await playSegment(fetched.blob, fetched.timing, index);
    }

    if (current !== requestId) return;
    if (latencyAudit) latencyAudit.completedMs = performance.now() - clickedAt;
    publishLatency();
    releasePlayback();
    setSpeakLabel('开始播报');
    setStatus('ready', '播报完成，嘴型、表情与讲话动作已平滑复位。');
    $('speak').removeAttribute('disabled');
  } catch (error) {
    if (current !== requestId || (error instanceof DOMException && error.name === 'AbortError')) return;
    releasePlayback(true, true);
    $('speak').removeAttribute('disabled');
    setSpeakLabel('重新生成');
    setStatus('error', `语音生成失败（已保留非流式回退）：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

function setupUi(): void {
  const restored = loadPresentationSettings();
  const strength = $<HTMLInputElement>('strength');
  strength.value = String(restored.strength);
  // The persisted/default button is an explicit presentation preference.
  // Semantic analysis still drives gestures, but cannot unexpectedly replace
  // the visible expression when the first narration starts.
  emotionController.setManual(restored.emotion);
  functionalAudit.emotionSource = 'manual';

  $('emotions').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-emotion]');
    if (!button) return;
    emotionController.setManual(button.dataset.emotion as AuditEmotion);
    functionalAudit.emotionHistory.push(auditState.emotion);
    functionalAudit.emotionSource = 'manual';
    savePresentationSettings();
    setStatus('ready', `已锁定${button.textContent}状态；表情只按人工选择切换。`);
  });

  const updateStrength = () => {
    const percentage = Math.round(Number(strength.value) * 100);
    auditState.baseExpressionStrength = Number(strength.value);
    if (!auditState.speaking) auditState.expressionStrength = auditState.baseExpressionStrength;
    $('strength-value').textContent = `${percentage}%`;
    strength.style.setProperty('--range-progress', `${percentage}%`);
  };
  updateStrength();
  strength.addEventListener('input', () => {
    updateStrength();
    savePresentationSettings();
  });
  $<HTMLTextAreaElement>('text').addEventListener('input', () => {
    if (!pausedByUser) {
      scheduleSpeechPrewarm();
      return;
    }
    const updatedText = ($<HTMLTextAreaElement>('text').value || '').trim();
    const mappedOffset = remapTextOffset(pausedSourceText, updatedText, pausedSourceOffset);
    const remainingText = remainingTextFromOffset(updatedText, mappedOffset);
    scheduleSpeechPrewarm(80, remainingText);
    setStatus('paused', '内容已更新；点击“继续播报”将从原暂停位置按新内容继续。');
  });

  $('speak').addEventListener('click', () => void speak());
  $('stop').addEventListener('click', () => {
    const stoppedMouth = auditState.mouth;
    if (latencyAudit && !latencyAudit.completedMs) latencyAudit.cancelled = true;
    publishLatency();
    releasePlayback(true, true);
    functionalAudit.stoppedMouth = stoppedMouth;
    $('speak').removeAttribute('disabled');
    setSpeakLabel('开始播报');
    setStatus('ready', '已立即停止播报并清空待播放内容，可修改后重新开始。');
  });
  $('retry').addEventListener('click', () => {
    // Reset only presentation controls. The user's script, the loaded model,
    // the current audio session, and lip sync must remain untouched.
    emotionController.setManual('natural');
    functionalAudit.emotionHistory.push('natural');
    functionalAudit.emotionSource = 'manual';
    strength.value = String(DEFAULT_EXPRESSION_STRENGTH);
    updateStrength();
    localStorage.removeItem(SETTINGS_KEY);
    motionController.resetPresentation();
    setStatus(
      pausedByUser ? 'paused' : 'ready',
      pausedByUser
        ? '已恢复默认表达；讲解内容已保留，播报仍处于暂停状态。'
        : '已恢复默认表达；讲解内容与当前播报均已保留。'
    );
  });

  $('reload-avatar').addEventListener('click', () => void restartAvatar());

  window.addEventListener('emotion-change', (event) => {
    const detail = (event as CustomEvent<{ source: 'auto' | 'manual' }>).detail;
    functionalAudit.emotionSource = detail.source;
  });
  window.addEventListener('avatar-ready', () => {
    avatarRestarting = false;
    $<HTMLButtonElement>('reload-avatar').hidden = true;
    $('speak').removeAttribute('disabled');
    setStatus('ready', 'Haru Reception 已通过官方 Cubism Web SDK 加载。');
    scheduleSpeechPrewarm(0);
    if (!performanceAuditStarted) {
      performanceAuditStarted = true;
      startPerformanceAudit();
    }
  });
  window.addEventListener('avatar-load-error', (event) => {
    avatarRestarting = false;
    const detail = (event as CustomEvent<{ message?: string }>).detail;
    $('speak').setAttribute('disabled', '');
    $('stop').setAttribute('disabled', '');
    $<HTMLButtonElement>('reload-avatar').hidden = false;
    setStatus('error', `${detail?.message ?? '人物模型加载失败'}。请检查资源后点击“重新加载人物”。`);
  });
  window.addEventListener('error', (event) => setStatus('error', `加载失败：${event.message}`));
  window.addEventListener('unhandledrejection', (event) => setStatus('error', `加载失败：${String(event.reason)}`));
}

function startAvatarRenderer(): boolean {
  const webgl2 = document.createElement('canvas').getContext('webgl2');
  if (!webgl2) {
    setStatus('error', '浏览器不支持 WebGL2。');
    $<HTMLButtonElement>('reload-avatar').hidden = false;
    return false;
  }
  const delegate = LAppDelegate.getInstance();
  if (!delegate.initialize()) {
    setStatus('error', 'Cubism WebGL2 初始化失败。');
    $<HTMLButtonElement>('reload-avatar').hidden = false;
    return false;
  }
  delegate.run();
  return true;
}

async function restartAvatar(): Promise<void> {
  if (avatarRestarting) return;
  avatarRestarting = true;
  const retryButton = $<HTMLButtonElement>('reload-avatar');
  retryButton.hidden = true;
  $('speak').setAttribute('disabled', '');
  $('stop').setAttribute('disabled', '');
  setStatus('loading', '正在重新加载人物资源…');
  releasePlayback(true, true);
  LAppDelegate.releaseInstance();
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-live2d-canvas="true"]').forEach((canvas) => canvas.remove());
  resetAvatarLoadAudit();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    if (!startAvatarRenderer()) avatarRestarting = false;
  } catch (error) {
    avatarRestarting = false;
    retryButton.hidden = false;
    setStatus('error', `人物重新加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function startPerformanceAudit(): void {
  let firstFrame = 0;
  let previousFrame = 0;
  let previousSecond = 0;
  let secondFrames = 0;
  const samples: number[] = [];
  const timestamps: number[] = [];
  const invalidReasons = new Set<string>();
  const actions: Array<{ atMs: number; type: string; target: string; value?: string }> = [];
  let maxStallMs = 0;

  const canvasSnapshot = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-live2d-canvas="true"]');
    const rect = canvas?.getBoundingClientRect();
    return {
      windowSize: `${outerWidth}x${outerHeight}`,
      viewportSize: `${innerWidth}x${innerHeight}`,
      canvasCssSize: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'unavailable',
      renderBufferSize: canvas ? `${canvas.width}x${canvas.height}` : 'unavailable',
      dpr: devicePixelRatio,
    };
  };
  const initialDimensions = canvasSnapshot();
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') invalidReasons.add('document-hidden');
  };
  const onBlur = () => invalidReasons.add('window-blurred');
  const onResize = () => invalidReasons.add('window-or-viewport-resized');
  const onInteraction = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLButtonElement | null;
    if (!target) return;
    const id = target.id || target.dataset.emotion || target.tagName.toLowerCase();
    if (['text', 'strength', 'speak', 'stop', 'retry'].indexOf(id) < 0 && !target.dataset.emotion) return;
    actions.push({
      atMs: firstFrame ? Number((performance.now() - firstFrame).toFixed(1)) : 0,
      type: event.type,
      target: id,
      value: target instanceof HTMLInputElement ? target.value : undefined,
    });
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  document.addEventListener('click', onInteraction, true);
  document.addEventListener('input', onInteraction, true);
  if (document.visibilityState !== 'visible') invalidReasons.add('document-hidden-at-start');
  if (!document.hasFocus()) invalidReasons.add('window-not-focused-at-start');

  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('click', onInteraction, true);
    document.removeEventListener('input', onInteraction, true);
  };

  const tick = (now: number) => {
    if (!firstFrame) {
      firstFrame = now;
      previousFrame = now;
      previousSecond = now;
      timestamps.push(0);
      requestAnimationFrame(tick);
      return;
    }
    const delta = now - previousFrame;
    maxStallMs = Math.max(maxStallMs, delta);
    previousFrame = now;
    timestamps.push(Number((now - firstFrame).toFixed(3)));
    secondFrames++;
    if (document.visibilityState !== 'visible') invalidReasons.add('document-hidden');
    if (!document.hasFocus()) invalidReasons.add('window-not-focused');
    const dimensions = canvasSnapshot();
    if (dimensions.windowSize !== initialDimensions.windowSize || dimensions.viewportSize !== initialDimensions.viewportSize) {
      invalidReasons.add('window-or-viewport-size-changed');
    }
    if (now - previousSecond >= 1000) {
      const fps = secondFrames * 1000 / (now - previousSecond);
      samples.push(fps);
      $('fps').textContent = `${Math.round(fps)} FPS`;
      secondFrames = 0;
      previousSecond = now;
    }
    const durationMs = now - firstFrame;
    if (durationMs >= 60000) {
      cleanup();
      const renderIntervals = timestamps.length - 1;
      const average = renderIntervals / (durationMs / 1000);
      const finalDimensions = canvasSnapshot();
      if (finalDimensions.windowSize !== initialDimensions.windowSize || finalDimensions.viewportSize !== initialDimensions.viewportSize) {
        invalidReasons.add('window-or-viewport-size-changed');
      }
      const result = {
        formula: 'render_intervals / (duration_ms / 1000)',
        model: 'Haru Reception / haru_greeter_t05',
        sdk: 'Cubism 5 SDK for Web R5',
        ...finalDimensions,
        initialDimensions,
        durationMs: Number(durationMs.toFixed(3)),
        renderIntervals,
        averageFps: Number(average.toFixed(2)),
        minimumOneSecondFps: Number(Math.min(...samples).toFixed(2)),
        maxStallMs: Number(maxStallMs.toFixed(3)),
        sampleCount: samples.length,
        webgl2: true,
        foreground: invalidReasons.size === 0,
        valid: durationMs >= 60000 && average >= 30 && invalidReasons.size === 0,
        invalidReasons: [...invalidReasons],
        actions,
        frameTimestampsMs: timestamps,
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

function startInputResponsivenessAudit(): void {
  if (!new URLSearchParams(location.search).has('input-audit')) return;
  const startedAt = performance.now();
  const result = {
    startedAt,
    focusTargetMs: 500,
    focusedAtMs: 0,
    focusDriftMs: 0,
    active: false,
    completed: false,
  };
  const publish = (): void => {
    document.documentElement.dataset.inputResponsiveness = JSON.stringify(result);
  };
  publish();

  window.setTimeout(() => {
    const textarea = $<HTMLTextAreaElement>('text');
    textarea.focus({ preventScroll: true });
    result.focusedAtMs = performance.now() - startedAt;
    result.focusDriftMs = result.focusedAtMs - result.focusTargetMs;
    result.active = document.activeElement === textarea;
    result.completed = true;
    publish();
  }, result.focusTargetMs);
}

const startApplication = (): void => {
  setupUi();
  startInputResponsivenessAudit();
  resetAvatarLoadAudit();
  startAvatarRenderer();
};

// Module scripts run after the document is parsed. Do not wait for the full
// window `load` event: high-priority model textures are allowed to preload in
// parallel while Cubism initializes, instead of blocking avatar startup.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication, { once: true });
} else {
  startApplication();
}

window.addEventListener('beforeunload', () => {
  releasePlayback(true, true);
  LAppDelegate.releaseInstance();
});

// A stale Live2D canvas is visually indistinguishable from motion ghosting:
// static body areas overlap exactly while arms from two animation loops appear
// in different poses. Dispose the SDK and canvas before Vite applies an HMR
// replacement so development updates can never stack avatar instances.
const hot = (import.meta as ImportMeta & {
  hot?: { dispose: (callback: () => void) => void };
}).hot;
hot?.dispose(() => {
  releasePlayback(true, true);
  LAppDelegate.releaseInstance();
  document
    .querySelectorAll<HTMLCanvasElement>('canvas[data-live2d-canvas="true"]')
    .forEach(canvas => canvas.remove());
});
