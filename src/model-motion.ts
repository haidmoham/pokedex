/** Public viewer API only: settle clip selection before sampling a real idle pose. */
export async function prepareIdle(viewer: {
  animationName: string | void; updateComplete: Promise<unknown>; availableAnimations: string[];
  duration: number; currentTime: number; timeScale: number; play: () => void; pause: () => void;
}, animation: string, signal: AbortSignal) {
  viewer.animationName = animation;
  await viewer.updateComplete;
  if (signal.aborted) return false;
  if (!viewer.availableAnimations.includes(animation)) throw new Error('Admitted idle is unavailable');
  if (!Number.isFinite(viewer.duration) || viewer.duration <= 0) throw new Error('Admitted idle has no usable duration');
  // A late reactive animation-name update can reset a pose sampled before it.
  viewer.play();
  viewer.currentTime = Math.min(0.35, viewer.duration / 2);
  if (!Number.isFinite(viewer.currentTime) || viewer.currentTime <= 0 || viewer.currentTime > viewer.duration) { viewer.pause(); throw new Error('Idle pose sampling failed'); }
  viewer.timeScale = 0.6;
  viewer.pause();
  return true;
}

export function idleMayPlay(requested: boolean, suspended: boolean, hidden: boolean, reducedMotion: boolean) {
  return requested && !suspended && !hidden && !reducedMotion;
}
