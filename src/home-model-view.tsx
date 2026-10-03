import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { artwork } from './feed-model';
import { fetchModel, validateModelTextures, type ModelAsset } from './model-policy';
import { mountHomeCanvas, type HomeCanvasController } from './home-canvas-runtime.js';
import type { HomeLayerApproximationDisclosure } from './home-effects.js';

// Normal-feed HOME source path. Only the active species mounts a renderer;
// no neighbor GLBs or corrected textures are prefetched.
export function HomeModelView({ asset, name, suspended = false, controlsTarget, onFallback, fallbackLabel = 'Use official art', onFailure, onInspect, onUsePriorModel }: {
  asset: ModelAsset; name: string; suspended?: boolean; controlsTarget: HTMLDivElement | null;
  onFallback: () => void; fallbackLabel?: string; onFailure: (reason?: 'unsupported') => void; onInspect: (active: boolean) => void;
  onUsePriorModel?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<HomeCanvasController | null>(null);
  const inspectButton = useRef<HTMLButtonElement>(null);
  const [prepared, setPrepared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [pose, setPose] = useState<number | null>(null);
  const [angle, setAngle] = useState(-12);
  const [disclosures, setDisclosures] = useState<HomeLayerApproximationDisclosure[]>([]);
  const fallback = useRef(onFallback); fallback.current = onFallback;
  const failure = useRef(onFailure); failure.current = onFailure;
  const inspect = useRef(onInspect); inspect.current = onInspect;
  const wasInspecting = useRef(false);
  useEffect(() => {
    inspect.current(inspecting);
    if (!inspecting && wasInspecting.current) inspectButton.current?.focus({ preventScroll: true });
    wasInspecting.current = inspecting;
    return () => inspect.current(false);
  }, [inspecting]);
  useEffect(() => { if (prepared && !suspended) setLoaded(true); }, [prepared, suspended]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) { controller.abort(); failure.current(); }
    }, 12000);
    const fail = () => {
      if (active && !controller.signal.aborted) { window.clearTimeout(timeout); controller.abort(); failure.current(); }
    };
    const canvas = document.createElement('canvas');
    let context: WebGL2RenderingContext | null = null;
    try { context = canvas.getContext('webgl2'); } catch { /* Use official art. */ }
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = canvas.height = 0;
    if (!context) {
      window.clearTimeout(timeout); controller.abort(); failure.current('unsupported');
      return () => { active = false; controller.abort(); };
    }
    fetchModel(asset, controller.signal).then(async blob => {
      await validateModelTextures(blob, controller.signal);
      if (!host.current) throw Error('HOME model host unavailable');
      return mountHomeCanvas({ host: host.current, bytes: await blob.arrayBuffer(), signal: controller.signal,
        dracoDecoderPath: '/model-runtime/draco/',
        allowReviewLayerApproximation: asset.allowDisclosedLayerApproximation === true,
        onFailure: fail });
    }).then(result => {
      if (!active || controller.signal.aborted) { result.dispose(); return; }
      mounted.current = result;
      result.setSuspended(suspended);
      setDisclosures(result.layerApproximations);
      window.clearTimeout(timeout);
      setPrepared(true);
    }).catch(fail);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      mounted.current?.dispose(); mounted.current = null;
    };
  }, [asset, name]);
  useEffect(() => { mounted.current?.setSuspended(suspended); }, [suspended, prepared]);
  useEffect(() => { mounted.current?.setInspect(inspecting); }, [inspecting, prepared]);
  useEffect(() => { mounted.current?.setAngle(angle); }, [angle, prepared]);
  useEffect(() => {
    if (!loaded) return;
    if (playing) mounted.current?.play(); else mounted.current?.pause();
  }, [playing, loaded]);
  const nextPose = () => {
    if (!mounted.current || !loaded) return;
    const next = pose === null ? 0 : (pose + 1) % 3;
    try { mounted.current.samplePose(next); setPlaying(false); setPose(next); }
    catch { failure.current(); }
  };
  const exit = () => { setAngle(-12); setInspecting(false); };
  const reviewNote = [asset.visualStatus !== 'pass' ? `Native idle · offline appearance ${asset.visualStatus === 'hold' ? 'needs repair' : 'uncertain'} · browser check pending` : '',
    disclosures.length > 0 ? 'Layer colors approximate the original shader; details in credits' : ''].filter(Boolean).join(' · ');
  return <div className={`model-stage ${inspecting ? 'is-inspecting' : ''}`} data-inspecting={inspecting || undefined}
    onPointerDown={event => { if (inspecting) event.stopPropagation(); }}
    onPointerUp={event => { if (inspecting) event.stopPropagation(); }}
    onWheel={event => { if (inspecting) event.stopPropagation(); }}
    onKeyDown={event => { if (!inspecting) return; event.stopPropagation(); if (event.key === 'Escape') exit(); }}>
    {!loaded && <img className="model-poster" src={artwork(asset.id)} alt={`${name}, official artwork while 3D loads`} />}
    <div className="model-host" ref={host} aria-hidden={!loaded} style={{ visibility: loaded ? 'visible' : 'hidden' }} />
    {loaded && reviewNote && <p className="model-review-note" title={disclosures.map(item => item.disclosure).join('\n')}>{reviewNote}</p>}
    {controlsTarget && createPortal(<div className="model-actions" onKeyDown={event => { if (inspecting && event.key === 'Escape') { event.stopPropagation(); exit(); } }}>
      {inspecting && <button onClick={() => setAngle(value => value - 30)} aria-label="Rotate model left">↶</button>}
      {loaded ? <button ref={inspectButton} onClick={() => inspecting ? exit() : setInspecting(true)}>{inspecting ? 'Done inspecting' : 'Inspect 3D'}</button> : <span role="status">Preparing 3D…</span>}
      {inspecting && <button onClick={() => setAngle(value => value + 30)} aria-label="Rotate model right">↷</button>}
      {loaded && <button aria-pressed={playing} onClick={() => { setPose(null); setPlaying(value => !value); }}>{playing ? 'Pause idle' : 'Play idle'}</button>}
      {loaded && inspecting && <button onClick={nextPose} aria-label={`Show idle pose ${pose === null ? 1 : (pose + 1) % 3 + 1} of 3`}>{pose === null ? 'Still poses' : `Pose ${pose + 1}/3`}</button>}
      {onUsePriorModel && <button onClick={onUsePriorModel}>Use prior 3D</button>}
      <button onClick={() => fallback.current()}>{fallbackLabel}</button>
    </div>, controlsTarget)}
  </div>;
}
