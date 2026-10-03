import type { ModelSize } from './model-framing.js';
export type ModelBounds = { size: ModelSize; center: ModelSize; radius: number };
export function loadModelBounds(blob: Blob, animation: string | null | undefined, signal: AbortSignal): Promise<ModelBounds>;
