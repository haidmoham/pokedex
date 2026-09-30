/** Public viewer API only: settle clip selection before sampling a real idle pose. */
export async function prepareIdle(viewer: {
  animationName: string | void; updateComplete: Promise<unknown>; availableAnimations: string[];
  duration: number; currentTime: number; timeScale: number; play: () => void; pause: () => void;
}, animation: string, signal: AbortSignal) {
  viewer.animationName = animation;
  await viewer.updateComplete;
  if (signal.aborted) return false;
  if (!viewer.availableAnimations.includes(animation)) throw new Error('Admitted idle is unavailable');
  // A late reactive animation-name update can reset a pose sampled before it.
  viewer.play();
  viewer.currentTime = Math.min(0.35, viewer.duration / 2);
  viewer.timeScale = 0.6;
  viewer.pause();
  return true;
}

export function idleMayPlay(requested: boolean, suspended: boolean, hidden: boolean, reducedMotion: boolean) {
  return requested && !suspended && !hidden && !reducedMotion;
}
