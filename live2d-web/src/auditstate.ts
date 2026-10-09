export type AuditEmotion = 'natural' | 'smile' | 'serious' | 'curious';
export type AuditMotionState = 'idle' | 'speaking' | 'emphasis' | 'finished';

export const DEFAULT_EXPRESSION_STRENGTH = 0.62;

export const auditState = {
  emotion: 'natural' as AuditEmotion,
  emotionSource: 'auto' as 'auto' | 'manual',
  baseExpressionStrength: DEFAULT_EXPRESSION_STRENGTH,
  expressionStrength: DEFAULT_EXPRESSION_STRENGTH,
  mouth: 0,
  motionState: 'idle' as AuditMotionState,
  speaking: false,
  speechPaused: false,
  speechEnergy: 0,
  speechIntensity: 0,
  speechCadence: 0,
  energyPeak: 0,
  gesturePulse: 0,
  gestureType: 'none' as 'none' | 'nod' | 'open_hand',
  emphasisPulse: 0,
  semanticEmphasis: false,
  playbackProgress: 0,
  activeCueIndex: -1,
  activeCueType: 'none' as 'none' | 'beat' | 'emphasis' | 'question' | 'welcome',
  semanticAction: 'none' as 'none' | 'nod' | 'open_hand' | 'head_tilt',
  semanticExpression: 0,
  semanticGesture: 0,
  semanticHead: 0,
  ready: false,
};

let avatarLoadStartedAt = performance.now();
export const avatarLoadAudit = {
  attempt: 0,
  startedAt: avatarLoadStartedAt,
  readyMs: 0,
  stages: {} as Record<string, number>,
};

export function resetAvatarLoadAudit(): void {
  avatarLoadStartedAt = performance.now();
  avatarLoadAudit.attempt += 1;
  auditState.ready = false;
  avatarLoadAudit.startedAt = avatarLoadStartedAt;
  avatarLoadAudit.readyMs = 0;
  avatarLoadAudit.stages = {};
  delete document.documentElement.dataset.avatarLoad;
  delete document.documentElement.dataset.avatarResources;
  delete document.documentElement.dataset.textureDecode;
}

export function markAvatarLoadError(message: string): void {
  auditState.ready = false;
  document.documentElement.dataset.avatarLoadError = message;
  window.dispatchEvent(new CustomEvent('avatar-load-error', {
    detail: { message },
  }));
}

export function markAvatarLoadStage(name: string): void {
  avatarLoadAudit.stages[name] = performance.now() - avatarLoadStartedAt;
  document.documentElement.dataset.avatarLoad = JSON.stringify(avatarLoadAudit);
}

export function markAvatarReady(): void {
  if (auditState.ready) return;
  auditState.ready = true;
  delete document.documentElement.dataset.avatarLoadError;
  avatarLoadAudit.readyMs = performance.now() - avatarLoadStartedAt;
  document.documentElement.dataset.avatarLoad = JSON.stringify(avatarLoadAudit);
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => /haru_greeter|live2dcubismcore/.test(entry.name))
    .map((entry) => ({
      name: entry.name.split('/').slice(-2).join('/'),
      startMs: Number(entry.startTime.toFixed(1)),
      durationMs: Number(entry.duration.toFixed(1)),
      transferBytes: entry.transferSize,
      encodedBytes: entry.encodedBodySize,
      decodedBytes: entry.decodedBodySize,
    }));
  document.documentElement.dataset.avatarResources = JSON.stringify(resources);
  window.dispatchEvent(new CustomEvent('avatar-ready'));
}
