export type AuditEmotion = 'natural' | 'smile' | 'serious' | 'doubt';

export const auditState = {
  emotion: 'natural' as AuditEmotion,
  strength: 0.62,
  mouth: 0,
  ready: false,
};

export function markAvatarReady(): void {
  if (auditState.ready) return;
  auditState.ready = true;
  window.dispatchEvent(new CustomEvent('avatar-ready'));
}
