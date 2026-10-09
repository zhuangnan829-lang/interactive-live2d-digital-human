import { AuditEmotion } from './auditstate';

export interface TextAnalysis {
  emotion: AuditEmotion;
  emphasis: boolean;
  reason: string;
  clauseCount: number;
  questionCount: number;
}

export interface SpeechFrame {
  energy: number;
  intensity: number;
  cadence: number;
  emphasisPulse: number;
  paused: boolean;
  energyPeak: number;
  gesturePulse: number;
  gestureType: 'none' | 'nod' | 'open_hand';
}

export type SemanticCueType = 'beat' | 'emphasis' | 'question' | 'welcome';
export type SemanticAction = 'none' | 'nod' | 'open_hand' | 'head_tilt';

export interface SemanticCue {
  index: number;
  type: SemanticCueType;
  text: string;
  start: number;
  peak: number;
  end: number;
  intensity: number;
  action: SemanticAction;
}

export interface SpeechTimeline {
  cues: SemanticCue[];
  estimatedDuration: number;
}

export interface TimelineFrame {
  cueIndex: number;
  cueType: SemanticCueType | 'none';
  action: SemanticAction;
  expression: number;
  gesture: number;
  head: number;
}

const includesAny = (text: string, words: string[]) =>
  words.some((word) => text.includes(word));

export function analyzeSpeechText(rawText: string): TextAnalysis {
  const text = rawText.trim();
  const questionCount = (text.match(/[？?]/g) || []).length;
  const clauseCount = Math.max(1, (text.match(/[，。！？；,.!?;]/g) || []).length + 1);
  const isQuestion = questionCount > 0 || includesAny(text, ['为什么', '如何', '怎么', '是否']);
  const isEmphasis = includesAny(text, ['重要', '注意', '核心', '关键', '首先', '务必', '必须']);
  const isWelcome = includesAny(text, ['欢迎', '体验', '介绍', '你好', '您好']);

  if (isQuestion) {
    return { emotion: 'curious', emphasis: false, reason: '疑问语义', clauseCount, questionCount };
  }
  if (isEmphasis) {
    return { emotion: 'serious', emphasis: true, reason: '重点语义', clauseCount, questionCount };
  }
  if (isWelcome) {
    return { emotion: 'smile', emphasis: false, reason: '欢迎/介绍语义', clauseCount, questionCount };
  }
  return { emotion: 'natural', emphasis: false, reason: '常规说明语义', clauseCount, questionCount };
}

export function buildSpeechTimeline(rawText: string): SpeechTimeline {
  const text = rawText.trim();
  const clauses = text.match(/[^，。！？；,.!?;]+[，。！？；,.!?;]?/g)?.map((part) => part.trim()).filter(Boolean)
    ?? (text ? [text] : []);
  const weightedClauses = clauses.map((clause) => {
    const punctuation = clause.charAt(clause.length - 1);
    const pauseWeight = /[。！？.!?]/.test(punctuation) ? 4 : /[，；,;]/.test(punctuation) ? 2 : 1;
    return { clause, weight: Math.max(2, clause.replace(/[，。！？；,.!?;]/g, '').length) + pauseWeight };
  });
  const totalWeight = Math.max(1, weightedClauses.reduce((sum, item) => sum + item.weight, 0));
  let cursor = 0;
  const cues = weightedClauses.map(({ clause, weight }, index): SemanticCue => {
    const start = cursor / totalWeight;
    cursor += weight;
    const end = cursor / totalWeight;
    const analysis = analyzeSpeechText(clause);
    const type: SemanticCueType = analysis.emphasis
      ? 'emphasis'
      : analysis.emotion === 'curious'
        ? 'question'
        : analysis.emotion === 'smile'
          ? 'welcome'
          : 'beat';
    const punctuationBoost = /[！!？?]$/.test(clause) ? 0.12 : 0;
    const baseIntensity = type === 'emphasis' ? 0.86 : type === 'question' ? 0.74 : type === 'welcome' ? 0.58 : 0.38;
    const action: SemanticAction = type === 'welcome'
      ? 'open_hand'
      : type === 'emphasis' || includesAny(clause, ['因此', '所以', '总结', '确认', '完成'])
        ? 'nod'
        : type === 'question'
          ? 'head_tilt'
          : 'none';
    return {
      index,
      type,
      text: clause,
      start,
      peak: start + (end - start) * 0.68,
      end,
      intensity: Math.min(1, baseIntensity + punctuationBoost),
      action,
    };
  });
  return {
    cues,
    estimatedDuration: Math.min(24, Math.max(1.4, text.length / 4.2)),
  };
}

export function sampleSpeechTimeline(timeline: SpeechTimeline, rawProgress: number): TimelineFrame {
  const progress = Math.min(1, Math.max(0, rawProgress));
  let strongest: { cue: SemanticCue; envelope: number } | null = null;
  for (const cue of timeline.cues) {
    if (progress < cue.start || progress > cue.end) continue;
    const rise = Math.max(0.001, cue.peak - cue.start);
    const fall = Math.max(0.001, cue.end - cue.peak);
    const linear = progress <= cue.peak
      ? (progress - cue.start) / rise
      : (cue.end - progress) / fall;
    const envelope = Math.sin(Math.min(1, Math.max(0, linear)) * Math.PI / 2) * cue.intensity;
    if (!strongest || envelope > strongest.envelope) strongest = { cue, envelope };
  }
  if (!strongest) return { cueIndex: -1, cueType: 'none', action: 'none', expression: 0, gesture: 0, head: 0 };
  const { cue, envelope } = strongest;
  return {
    cueIndex: cue.index,
    cueType: cue.type,
    action: cue.action,
    expression: envelope,
    gesture: envelope * (cue.action === 'nod' ? 0.72 : cue.action === 'open_hand' ? 0.58 : 0),
    head: envelope * (cue.action === 'head_tilt' ? 1 : cue.action === 'nod' ? 0.42 : 0),
  };
}

export class SpeechAnalyzer {
  private smoothedEnergy = 0;
  private previousEnergy = 0;
  private cadence = 0;
  private emphasisPulse = 0;
  private lastActiveAt = 0;
  private lastTimestamp = 0;
  private pauseStartedAt = 0;
  private lastPeakAt = 0;
  private gesturePulse = 0;
  private gestureType: SpeechFrame['gestureType'] = 'none';

  reset(): void {
    this.smoothedEnergy = 0;
    this.previousEnergy = 0;
    this.cadence = 0;
    this.emphasisPulse = 0;
    this.lastActiveAt = 0;
    this.lastTimestamp = 0;
    this.pauseStartedAt = 0;
    this.lastPeakAt = 0;
    this.gesturePulse = 0;
    this.gestureType = 'none';
  }

  update(energy: number, timestamp: number): SpeechFrame {
    const delta = this.lastTimestamp ? Math.min(0.1, (timestamp - this.lastTimestamp) / 1000) : 1 / 60;
    this.lastTimestamp = timestamp;
    const clamped = Math.min(1, Math.max(0, energy));
    const smoothing = clamped > this.smoothedEnergy ? 0.22 : 0.08;
    this.smoothedEnergy += (clamped - this.smoothedEnergy) * smoothing;

    const active = this.smoothedEnergy > 0.075;
    if (!active && !this.pauseStartedAt) this.pauseStartedAt = timestamp;
    const pauseDuration = this.pauseStartedAt ? timestamp - this.pauseStartedAt : 0;
    const phraseRestart = active && pauseDuration > 180;
    if (active) this.pauseStartedAt = 0;
    const onset = active && timestamp - this.lastActiveAt > 170 && clamped - this.previousEnergy > 0.055;
    if (onset) {
      this.cadence = Math.min(1, this.cadence + 0.2);
      this.lastActiveAt = timestamp;
    } else {
      this.cadence = Math.max(0, this.cadence - delta * 0.24);
    }

    const highEnergy = Math.max(0, (this.smoothedEnergy - 0.34) / 0.66);
    this.emphasisPulse += (highEnergy - this.emphasisPulse) * (highEnergy > this.emphasisPulse ? 0.16 : 0.055);
    const energyRise = clamped - this.previousEnergy;
    const peak = active && this.smoothedEnergy > 0.38 && energyRise > 0.045 && timestamp - this.lastPeakAt > 520;
    if (peak || (phraseRestart && timestamp - this.lastPeakAt > 420)) {
      this.lastPeakAt = timestamp;
      // Audio decides when an accent may happen. The semantic layer decides
      // whether that accent becomes a nod, open hand, head tilt, or nothing.
      this.gestureType = 'nod';
      this.gesturePulse = peak ? Math.min(1, 0.42 + this.smoothedEnergy * 0.58) : 0.38;
    } else {
      this.gesturePulse = Math.max(0, this.gesturePulse - delta * 1.75);
      if (this.gesturePulse === 0) this.gestureType = 'none';
    }
    this.previousEnergy = clamped;

    const intensity = this.smoothedEnergy < 0.3
      ? this.smoothedEnergy * 0.72
      : this.smoothedEnergy < 0.7
        ? 0.216 + (this.smoothedEnergy - 0.3) * 1.16
        : 0.68 + (this.smoothedEnergy - 0.7) * 1.06;

    return {
      energy: this.smoothedEnergy,
      intensity: Math.min(1, intensity),
      cadence: this.cadence,
      emphasisPulse: this.emphasisPulse,
      paused: pauseDuration > 110,
      energyPeak: peak ? this.smoothedEnergy : 0,
      gesturePulse: this.gesturePulse,
      gestureType: this.gestureType,
    };
  }
}
