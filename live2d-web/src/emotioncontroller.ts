import { auditState, AuditEmotion } from './auditstate';
import { SemanticCueType, TextAnalysis } from './speechanalyzer';

const emotionLabels: Record<AuditEmotion, string> = {
  natural: '自然',
  smile: '微笑',
  serious: '认真',
  curious: '疑惑',
};

export class EmotionController {
  private manualEmotion: AuditEmotion | null = null;
  private autoEmotion: AuditEmotion = 'natural';

  setManual(emotion: AuditEmotion): void {
    this.manualEmotion = emotion;
    this.apply(emotion, 'manual');
  }

  beginSpeech(_analysis: TextAnalysis): AuditEmotion {
    // The four panel buttons are authoritative. Text analysis may still drive
    // semantic gestures, but it must never replace the expression selected by
    // the user when a new speech segment starts.
    this.autoEmotion = 'natural';
    const resolved = this.manualEmotion ?? 'natural';
    this.apply(resolved, this.manualEmotion ? 'manual' : 'auto');
    return resolved;
  }

  finishSpeech(): void {
    if (this.manualEmotion) {
      this.apply(this.manualEmotion, 'manual');
      return;
    }
    this.autoEmotion = 'natural';
    this.apply('natural', 'auto');
  }

  syncSemanticCue(cueType: SemanticCueType | 'none'): void {
    if (this.manualEmotion) return;
    const next: AuditEmotion = cueType === 'question'
      ? 'curious'
      : cueType === 'emphasis'
        ? 'serious'
        : cueType === 'welcome'
          ? 'smile'
          : 'natural';
    if (next === this.autoEmotion) return;
    this.autoEmotion = next;
    this.apply(next, 'auto');
  }

  reset(): void {
    this.manualEmotion = null;
    this.autoEmotion = 'natural';
    this.apply('natural', 'auto');
  }

  hasManualOverride(): boolean {
    return this.manualEmotion !== null;
  }

  private apply(emotion: AuditEmotion, source: 'manual' | 'auto'): void {
    auditState.emotion = emotion;
    auditState.emotionSource = source;
    document.querySelectorAll<HTMLButtonElement>('#emotions button').forEach((button) => {
      button.classList.toggle('selected', button.dataset.emotion === emotion);
      button.setAttribute('aria-pressed', String(button.dataset.emotion === emotion));
    });
    window.dispatchEvent(new CustomEvent('emotion-change', {
      detail: { emotion, source, label: emotionLabels[emotion] },
    }));
  }
}
