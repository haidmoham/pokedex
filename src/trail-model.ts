import type { Visit } from './visit-model';

export type TrailCursor = { artist: string; speciesId: number; phase: 'artist' | 'species' | 'related'; offset: number; position: number };
export type TrailStep = { visit: Visit; context: string };
export type TrailPath = { steps: TrailStep[]; index: number; cursor: TrailCursor | null };

export function extendTrail(path: TrailPath | null, origin: TrailStep, next: TrailStep, cursor: TrailCursor | null): TrailPath {
  const steps = [...(path?.steps.slice(0, path.index + 1) ?? [origin]), next];
  return { steps, index: steps.length - 1, cursor };
}

export function traverseTrail(path: TrailPath, direction: number): TrailPath {
  const index = path.index + direction;
  return index < 0 || index >= path.steps.length ? path : { ...path, index };
}
