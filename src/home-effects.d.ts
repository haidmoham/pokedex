/** Three-specific compatibility for pinned HOME reconstruction GLBs. */
export interface HomeLayerTextures {
  base: { isTexture: true; channel: number; updateMatrix(): void; matrix: unknown };
  layer: { isTexture: true; channel: number; updateMatrix(): void; matrix: unknown };
  /** Original packed red-channel emission mask when the derived material emits. */
  emissionMask?: { isTexture: true; channel: number; updateMatrix(): void; matrix: unknown };
  /** Explicit Atlas-style visual-review approximation; original shader equation is unverified. */
  composite: { equation: 'atlas-alpha-over-review'; baseUv: 0 | 1; layerUv: 0 | 1;
    layerCalcMulti: number; layerOverLerpValue: number; layerBlendMode: number };
}

export interface HomeEffectsOptions {
  /** Exact material names from a hash-bound source audit. */
  requiredLayerMaterials?: string[];
  /** Original source textures, preloaded and configured from pinned metadata. */
  layeredMaterials?: Record<string, HomeLayerTextures>;
}

export interface HomeEffectsRuntime {
  scene: unknown;
  clip: { duration: number; tracks: unknown[] };
  mixer: { setTime(time: number): void; update(delta: number): void; stopAllAction(): void };
  duration: number;
  stencilRefs: number[];
  visibilityNodes: string[];
  layeredMaterialNames: string[];
  /** Stop and uncache animation; caller also disposes scene resources and renderer. */
  dispose(): void;
}

export function inspectHomeEffects(json: unknown, requiredLayerMaterials?: string[]): {
  stencil: boolean;
  visibility: boolean;
  additive: boolean;
  layeredMaterialNames: string[];
  needsCustomRenderer: boolean;
};

/** Construct a separate Three renderer and verify its real stencil context. */
export function createHomeRenderer(THREE: unknown, parameters: { canvas: HTMLCanvasElement; alpha?: boolean; antialias?: boolean }): unknown;

/** Mutates the decoded, private scene after preflighting all requested effects. */
export function prepareHomeEffects(gltf: unknown, THREE: unknown, options?: HomeEffectsOptions): HomeEffectsRuntime;
