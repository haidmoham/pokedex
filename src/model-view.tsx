import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModelViewerElement } from '@google/model-viewer';
import { fetchModel, validateModelTextures, priorReleasedModel, ModelAsset } from './model-policy';
import { artwork } from './feed-model';
import { prepareIdle, idleMayPlay, sampleIdlePose, IDLE_POSE_PHASES } from './model-motion';
import { loadModelBounds, type ModelBounds } from './model-bounds.js';
import { framingDistance, inspectionDistance } from './model-framing.js';
import { HomeModelView } from './home-model-view';

async function frameLegacyCamera(element: ModelViewerElement, { size, center }: ModelBounds, inspecting = false, angle = -12) {
  await element.updateComplete;
  if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
  const aspect = element.clientWidth / element.clientHeight;
  // model-viewer adapts FOV to its viewport; fit using its actual FOV.
  const fov = element.getFieldOfView();
  const distance = inspecting ? inspectionDistance(size, aspect, fov) : framingDistance(size, aspect, -12, 85, fov);
  element.setAttribute('camera-target', `${center.x}m ${center.y}m ${center.z}m`);
  element.setAttribute('min-camera-orbit', `auto 35deg ${distance}m`);
  element.setAttribute('max-camera-orbit', `auto 145deg ${distance * 3.2}m`);
  element.setAttribute('camera-orbit', `${inspecting ? angle : -12}deg 85deg ${distance}m`);
  await element.updateComplete;
  element.jumpCameraToGoal();
}

// Probe an independent canvas once per page, before loading the shared renderer.
// model-viewer can emit load after WebGL construction failed; load is not render proof.
let rendererAvailable: boolean | undefined;
function hasModelRenderer() {
  if (rendererAvailable !== undefined) return rendererAvailable;
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('webgl2');
    rendererAvailable = Boolean(context);
    // This is only our disposable probe, never model-viewer's shared context.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { rendererAvailable = false; }
  canvas.width = canvas.height = 0;
  return rendererAvailable;
}

// Only the active admitted view mounts this component. No adjacent GLB fetches.
function LegacyModelView({ asset, name, suspended = false, controlsTarget, onFallback, fallbackLabel = 'Use official art', onFailure, onInspect, onUseNativeIdle }: { asset: ModelAsset; name: string; suspended?: boolean; controlsTarget: HTMLDivElement | null; onFallback: () => void; fallbackLabel?: string; onFailure: (reason?: 'unsupported') => void; onInspect: (active: boolean) => void; onUseNativeIdle?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ModelViewerElement | null>(null);
  const inspectButton = useRef<HTMLButtonElement>(null);
  const bounds = useRef<ModelBounds | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [angle, setAngle] = useState(-12);
  const [playing, setPlaying] = useState(true);
  const [pose, setPose] = useState<number | null>(null);
  const fallback = useRef(onFallback);
  fallback.current = onFallback;
  const failure = useRef(onFailure);
  failure.current = onFailure;
  const wasInspecting = useRef(false);
  const inspect = useRef(onInspect);
  inspect.current = onInspect;
  useEffect(() => {
    inspect.current(inspecting);
    if (!inspecting && wasInspecting.current) inspectButton.current?.focus({ preventScroll: true });
  wasInspecting.current = inspecting;
    return () => inspect.current(false);
  }, [inspecting]);
  // Loading can finish during a swipe. Retain the displayed poster until the
  // gesture settles rather than substituting a 3D frame during movement.
  useEffect(() => { if (prepared && !suspended) setLoaded(true); }, [prepared, suspended]);
  useEffect(() => {
    const controller = new AbortController();
    let source: string | undefined;
    let element: ModelViewerElement | undefined;
    const fail = () => { if (!controller.signal.aborted) { window.clearTimeout(timeout); controller.abort(); failure.current(); } };
    const timeout = window.setTimeout(fail, 12000);
    if (!hasModelRenderer()) {
      window.clearTimeout(timeout);
      controller.abort();
      failure.current('unsupported');
      return () => controller.abort();
    }
    Promise.all([import('@google/model-viewer'), fetchModel(asset, controller.signal).then(async blob => {
      await validateModelTextures(blob, controller.signal);
      const envelope = await loadModelBounds(blob, asset.animation, controller.signal);
      return { blob, envelope };
    })]).then(([runtime, { blob, envelope }]) => {
      if (controller.signal.aborted || !host.current) return;
      bounds.current = envelope;
      runtime.ModelViewerElement.modelCacheSize = 0;
      runtime.ModelViewerElement.meshoptDecoderLocation = '/model-runtime/meshopt-decoder.js';
      source = URL.createObjectURL(blob);
      element = document.createElement('model-viewer');
      viewer.current = element;
      element.src = source;
      element.alt = `${name}, interactive 3D model`;
      element.setAttribute('interaction-prompt', 'none');
      element.setAttribute('touch-action', 'pan-y');
      element.setAttribute('camera-orbit', '-12deg 85deg auto');
      element.setAttribute('field-of-view', '35deg');
      element.setAttribute('shadow-intensity', '0');
      element.animationCrossfadeDuration = 0;
      element.setAttribute('loading', 'eager');
      element.style.pointerEvents = 'none';
      element.tabIndex = -1;
      element.addEventListener('error', fail);
      element.addEventListener('load', async () => {
        if (controller.signal.aborted) return;
        try {
          if (asset.animation && !await prepareIdle(element!, asset.animation, controller.signal)) return;
          if (controller.signal.aborted) return;
          await frameLegacyCamera(element!, envelope);
          if (controller.signal.aborted) return;
          window.clearTimeout(timeout);
          setPrepared(true);
        } catch { fail(); }
      }, { once: true });
      host.current.append(element);
    }).catch(fail);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      if (element) { element.pause(); element.src = null; element.remove(); }
      viewer.current = null; bounds.current = null;
      if (source) URL.revokeObjectURL(source);
    };
  }, [asset, name]);
  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    element.toggleAttribute('camera-controls', inspecting);
    element.style.pointerEvents = inspecting ? 'auto' : 'none';
    if (!loaded) return;
    let active = true;
    const frameCamera = async () => {
      await element.updateComplete;
      if (!active) return;
      if (!bounds.current) return;
      await frameLegacyCamera(element, bounds.current, inspecting, angle);
    };
    const frame = () => { void frameCamera().catch(() => { if (active) failure.current(); }); };
    const resize = new ResizeObserver(frame);
    resize.observe(element);
    frame();
    element.tabIndex = inspecting ? 0 : -1;
    return () => { active = false; resize.disconnect(); };
  }, [loaded, inspecting, angle]);
  useEffect(() => {
    const element = viewer.current;
    if (!element || !loaded) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { if (asset.animation && idleMayPlay(playing, suspended, document.hidden, preference.matches)) element.play(); else element.pause(); };
    sync();
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', sync);
    return () => { document.removeEventListener('visibilitychange', sync); preference.removeEventListener('change', sync); element.pause(); };
  }, [loaded, playing, suspended]);
  const nextPose = () => {
    if (!viewer.current || !asset.animation || !loaded) return;
    const next = pose === null ? 0 : (pose + 1) % IDLE_POSE_PHASES.length;
    try {
      sampleIdlePose(viewer.current, next);
      setPlaying(false);
      setPose(next);
    } catch { failure.current(); }
  };
  const exit = () => { setAngle(-12); setInspecting(false); };
  return <div className={`model-stage ${inspecting ? 'is-inspecting' : ''}`} data-inspecting={inspecting || undefined}
    onPointerDown={event => { if (inspecting) event.stopPropagation(); }} onPointerUp={event => { if (inspecting) event.stopPropagation(); }}
    onWheel={event => { if (inspecting) event.stopPropagation(); }} onKeyDown={event => { if (!inspecting) return; event.stopPropagation(); if (event.key === 'Escape') exit(); }}>
    {!loaded && <img className="model-poster" src={artwork(asset.id)} alt={`${name}, official artwork while 3D loads`} />}
    <div className="model-host" ref={host} aria-hidden={!loaded} style={{ visibility: loaded ? 'visible' : 'hidden' }} />
    {controlsTarget && createPortal(<div className="model-actions" onKeyDown={event => { if (inspecting && event.key === 'Escape') { event.stopPropagation(); exit(); } }}>
      {inspecting && <button onClick={() => setAngle(value => value - 30)} aria-label="Rotate model left">↶</button>}
      {loaded ? <button ref={inspectButton} onClick={() => inspecting ? exit() : setInspecting(true)}>{inspecting ? 'Done inspecting' : 'Inspect 3D'}</button> : <span role="status">Preparing 3D…</span>}
      {inspecting && <button onClick={() => setAngle(value => value + 30)} aria-label="Rotate model right">↷</button>}
      {loaded && asset.animation && <button aria-pressed={playing} onClick={() => { setPose(null); setPlaying(value => !value); }}>{playing ? 'Pause idle' : 'Play idle'}</button>}
      {loaded && asset.animation && inspecting && <button onClick={nextPose}
        aria-label={`Show idle pose ${pose === null ? 1 : (pose + 1) % IDLE_POSE_PHASES.length + 1} of ${IDLE_POSE_PHASES.length}`}>
        {pose === null ? 'Still poses' : `Pose ${pose + 1}/${IDLE_POSE_PHASES.length}`}
      </button>}
      {onUseNativeIdle && <button onClick={onUseNativeIdle}>Try native idle</button>}
      <button onClick={() => fallback.current()}>{fallbackLabel}</button>
    </div>, controlsTarget)}
  </div>;
}
export function ModelView(props: Parameters<typeof LegacyModelView>[0]) {
  const [usePrior, setUsePrior] = useState(false);
  const prior = props.asset.integratedNativeIdle ? priorReleasedModel(props.asset.id) : undefined;
  if (props.asset.runtime === 'home-canvas' && !usePrior) {
    return <HomeModelView {...props} onUsePriorModel={prior ? () => setUsePrior(true) : undefined}
      onFailure={reason => { if (prior && reason !== 'unsupported') setUsePrior(true); else props.onFailure(reason); }} />;
  }
  return <LegacyModelView {...props} asset={usePrior && prior ? prior : props.asset}
    onUseNativeIdle={usePrior ? () => setUsePrior(false) : undefined} />;
}
