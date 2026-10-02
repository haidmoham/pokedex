import type { HomeLayerTextures, HomeLayerApproximationDisclosure } from './home-effects.js';

export interface HomeCanvasOptions {
  host: HTMLElement;
  /** GLB bytes already hash-checked and structurally validated by the caller. */
  bytes: ArrayBuffer | ArrayBufferView;
  /** Abort immediately when the active model/selection changes. */
  signal: AbortSignal;
  /** Local, versioned public directory containing Three's Draco decoder files. */
  dracoDecoderPath: string;
  requiredLayerMaterials?: string[];
  /** Fresh, source-verified textures whose ownership transfers to the mount. */
  layeredMaterials?: Record<string, HomeLayerTextures>;
  /** Explicitly disclosed Atlas-style layer approximation. Defaults to fail-closed. */
  allowReviewLayerApproximation?: boolean;
  cameraOrbitPercent?: number;
  /** Reports post-mount render failures; initial mount rejects its Promise. */
  onFailure?: (error: unknown) => void;
}

export interface HomeCanvasController {
  scene: unknown;
  clip: unknown;
  duration: number;
  /** Display these per-material review approximations; no source-shader equivalence is claimed. */
  layerApproximations: HomeLayerApproximationDisclosure[];
  canvas: HTMLCanvasElement;
  play(): void;
  pause(): void;
  setSuspended(suspended: boolean): void;
  setInspect(inspecting: boolean): void;
  setAngle(degrees: number): void;
  setOrbitPercent(percent: number): void;
  samplePose(index: number): void;
  resize(): void;
  dispose(): void;
  readonly isInspecting: boolean;
  readonly isDisposed: boolean;
}

/** Only one mounted canvas/model should be active in the host at a time. */
export function mountHomeCanvas(options: HomeCanvasOptions): Promise<HomeCanvasController>;
