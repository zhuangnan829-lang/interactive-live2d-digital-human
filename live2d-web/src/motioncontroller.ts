import { auditState, AuditMotionState } from './auditstate';
import { sampleSpeechTimeline, SpeechFrame, SpeechTimeline, TextAnalysis } from './speechanalyzer';

export class MotionController {
  private finishTimer: number | null = null;
  private timeline: SpeechTimeline = { cues: [], estimatedDuration: 1.4 };
  private lastGestureCueIndex = -1;
  private activeGesture: 'none' | 'nod' | 'open_hand' = 'none';
  private lastGestureAt = Number.NEGATIVE_INFINITY;

  start(analysis: TextAnalysis, timeline: SpeechTimeline): void {
    this.clearFinishTimer();
    this.timeline = timeline;
    this.lastGestureCueIndex = -1;
    this.activeGesture = 'none';
    this.lastGestureAt = Number.NEGATIVE_INFINITY;
    auditState.motionState = 'speaking';
    document.documentElement.dataset.avatarMotionState = 'speaking';
    auditState.speaking = true;
    auditState.speechPaused = false;
    auditState.semanticEmphasis = analysis.emphasis;
    auditState.speechEnergy = 0;
    auditState.speechIntensity = 0;
    auditState.speechCadence = 0;
    auditState.energyPeak = 0;
    auditState.gesturePulse = 0;
    auditState.gestureType = 'none';
    auditState.emphasisPulse = analysis.emphasis ? 0.2 : 0;
    this.applyTimeline(0, 0);
  }

  update(frame: SpeechFrame, playbackProgress: number): void {
    auditState.speechEnergy = frame.energy;
    auditState.speechIntensity = frame.intensity;
    auditState.speechCadence = frame.cadence;
    auditState.speechPaused = frame.paused;
    auditState.energyPeak = frame.energyPeak;
    const activityGate = frame.paused ? 0 : Math.min(1, 0.12 + frame.intensity * 0.88);
    this.applyTimeline(playbackProgress, activityGate);
    const semanticallyEmphatic = auditState.activeCueType === 'emphasis';
    const accentAllowed = frame.gesturePulse > 0 && !frame.paused;
    const requestedGesture = auditState.semanticAction === 'open_hand'
      ? 'open_hand'
      : auditState.semanticAction === 'nod'
        ? 'nod'
        : 'none';
    const gestureCooldown = requestedGesture === 'open_hand' ? 1800 : 900;
    const now = performance.now();
    if (
      accentAllowed &&
      requestedGesture !== 'none' &&
      auditState.activeCueIndex !== this.lastGestureCueIndex &&
      now - this.lastGestureAt >= gestureCooldown
    ) {
      this.lastGestureCueIndex = auditState.activeCueIndex;
      this.activeGesture = requestedGesture;
      this.lastGestureAt = now;
    }
    if (!accentAllowed) this.activeGesture = 'none';
    auditState.gesturePulse = this.activeGesture === 'none' ? 0 : frame.gesturePulse * activityGate;
    auditState.gestureType = this.activeGesture;
    const semanticBase = semanticallyEmphatic ? 0.16 : 0;
    auditState.emphasisPulse = semanticallyEmphatic
      ? Math.max(semanticBase, frame.emphasisPulse)
      : frame.emphasisPulse * 0.2;
    const semanticLift = auditState.activeCueType === 'emphasis' ? 0.16 : 0;
    const targetStrength = auditState.baseExpressionStrength
      * (0.65 + Math.min(1, frame.intensity + semanticLift) * 0.65);
    auditState.expressionStrength = Math.min(1, Math.max(0, targetStrength));
    const next: AuditMotionState = semanticallyEmphatic || frame.intensity > 0.88
      ? 'emphasis'
      : 'speaking';
    auditState.motionState = frame.paused ? 'speaking' : next;
    document.documentElement.dataset.avatarMotionState = auditState.motionState;
  }

  pause(): void {
    if (!auditState.speaking) return;
    auditState.speechPaused = true;
    auditState.speechEnergy = 0;
    auditState.speechIntensity = 0;
    auditState.energyPeak = 0;
    auditState.gesturePulse = 0;
    auditState.gestureType = 'none';
    this.activeGesture = 'none';
    auditState.emphasisPulse = 0;
    auditState.expressionStrength = Math.min(1, auditState.baseExpressionStrength * 0.65);
    auditState.motionState = 'speaking';
    document.documentElement.dataset.avatarMotionState = 'speaking';
  }

  resume(): void {
    if (!auditState.speaking) return;
    auditState.speechPaused = false;
    auditState.motionState = 'speaking';
    document.documentElement.dataset.avatarMotionState = 'speaking';
  }

  finish(): void {
    this.clearFinishTimer();
    auditState.motionState = 'finished';
    document.documentElement.dataset.avatarMotionState = 'finished';
    auditState.speaking = false;
    auditState.speechPaused = false;
    auditState.speechEnergy = 0;
    auditState.speechIntensity = 0;
    auditState.speechCadence = 0;
    auditState.energyPeak = 0;
    auditState.gesturePulse = 0;
    auditState.gestureType = 'none';
    this.activeGesture = 'none';
    auditState.expressionStrength = auditState.baseExpressionStrength;
    auditState.emphasisPulse = 0;
    auditState.semanticEmphasis = false;
    this.clearTimelineState();
    this.finishTimer = window.setTimeout(() => {
      auditState.motionState = 'idle';
      document.documentElement.dataset.avatarMotionState = 'idle';
      this.finishTimer = null;
    }, 650);
  }

  reset(): void {
    this.clearFinishTimer();
    auditState.motionState = 'idle';
    document.documentElement.dataset.avatarMotionState = 'idle';
    auditState.speaking = false;
    auditState.speechPaused = false;
    auditState.speechEnergy = 0;
    auditState.speechIntensity = 0;
    auditState.speechCadence = 0;
    auditState.energyPeak = 0;
    auditState.gesturePulse = 0;
    auditState.gestureType = 'none';
    this.activeGesture = 'none';
    this.lastGestureCueIndex = -1;
    this.lastGestureAt = Number.NEGATIVE_INFINITY;
    auditState.expressionStrength = auditState.baseExpressionStrength;
    auditState.emphasisPulse = 0;
    auditState.semanticEmphasis = false;
    this.timeline = { cues: [], estimatedDuration: 1.4 };
    this.clearTimelineState();
  }

  resetPresentation(): void {
    auditState.expressionStrength = auditState.baseExpressionStrength;
    auditState.gesturePulse = 0;
    auditState.gestureType = 'none';
    this.activeGesture = 'none';
    auditState.emphasisPulse = 0;
    auditState.semanticExpression = 0;
    auditState.semanticGesture = 0;
    auditState.semanticHead = 0;
    if (!auditState.speaking) {
      auditState.motionState = 'idle';
      document.documentElement.dataset.avatarMotionState = 'idle';
      this.clearTimelineState();
    }
  }

  private applyTimeline(progress: number, activityGate: number): void {
    const timelineFrame = sampleSpeechTimeline(this.timeline, progress);
    auditState.playbackProgress = Math.min(1, Math.max(0, progress));
    auditState.activeCueIndex = timelineFrame.cueIndex;
    auditState.activeCueType = timelineFrame.cueType;
    auditState.semanticAction = timelineFrame.action;
    auditState.semanticExpression = timelineFrame.expression * activityGate;
    auditState.semanticGesture = timelineFrame.gesture * activityGate;
    auditState.semanticHead = timelineFrame.head * activityGate;
  }

  private clearTimelineState(): void {
    auditState.playbackProgress = 0;
    auditState.activeCueIndex = -1;
    auditState.activeCueType = 'none';
    auditState.semanticAction = 'none';
    auditState.semanticExpression = 0;
    auditState.semanticGesture = 0;
    auditState.semanticHead = 0;
  }

  private clearFinishTimer(): void {
    if (this.finishTimer !== null) window.clearTimeout(this.finishTimer);
    this.finishTimer = null;
  }
}
