import { useEffect, useRef, useState } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import { fetchModel, validateModelTextures, ModelAsset } from './model-policy';
import { artwork } from './feed-model';

// Only the active admitted view mounts this component. No adjacent GLB fetches.
export function ModelView({ asset, name, onFallback, onInspect }: { asset: ModelAsset; name: string; onFallback: () => void; onInspect: (active: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ModelViewerElement | null>(null);
  const inspectButton = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [angle, setAngle] = useState(0);
  const fallback = useRef(onFallback);
  fallback.current = onFallback;
  const wasInspecting = useRef(false);
  const inspect = useRef(onInspect);
  inspect.current = onInspect;
  useEffect(() => {
    inspect.current(inspecting);
    if (!inspecting && wasInspecting.current) inspectButton.current?.focus({ preventScroll: true });
    wasInspecting.current = inspecting;
    return () => inspect.current(false);
  }, [inspecting]);
  useEffect(() => {
    const controller = new AbortController();
    let source: string | undefined;
    let element: ModelViewerElement | undefined;
    const timeout = window.setTimeout(() => { controller.abort(); fallback.current(); }, 12000);
    const visibility = () => { if (document.hidden) element?.pause(); };
    document.addEventListener('visibilitychange', visibility);
    const fail = () => { if (!controller.signal.aborted) { controller.abort(); fallback.current(); } };
    Promise.all([import('@google/model-viewer'), fetchModel(asset, controller.signal).then(async blob => { await validateModelTextures(blob, controller.signal); return blob; })]).then(([runtime, blob]) => {
      if (controller.signal.aborted || !host.current) return;
      runtime.ModelViewerElement.modelCacheSize = 0;
      source = URL.createObjectURL(blob);
      element = document.createElement('model-viewer');
      viewer.current = element;
      element.src = source;
      element.alt = `${name}, interactive 3D model`;
      element.setAttribute('interaction-prompt', 'none');
      element.setAttribute('touch-action', 'pan-y');
      element.setAttribute('camera-orbit', '0deg 75deg auto');
      element.setAttribute('shadow-intensity', '0');
      element.setAttribute('loading', 'eager');
      element.style.pointerEvents = 'none';
      element.tabIndex = -1;
      element.addEventListener('error', fail);
      element.addEventListener('load', () => {
        if (controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setLoaded(true);
        // Remain still in browsing. Inspect does not auto-rotate or auto-play.
      }, { once: true });
      host.current.append(element);
    }).catch(fail);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', visibility);
      window.clearTimeout(timeout);
      if (element) { element.pause(); element.src = null; element.remove(); }
      viewer.current = null;
      if (source) URL.revokeObjectURL(source);
    };
  }, [asset, name]);
  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    element.toggleAttribute('camera-controls', inspecting);
    element.style.pointerEvents = inspecting ? 'auto' : 'none';
    element.setAttribute('camera-orbit', `${angle}deg 75deg auto`);
    element.tabIndex = inspecting ? 0 : -1;
  }, [loaded, inspecting, angle]);
  const exit = () => setInspecting(false);
  return <div className={`model-stage ${inspecting ? 'is-inspecting' : ''}`} data-inspecting={inspecting || undefined}
    onPointerDown={event => { if (inspecting) event.stopPropagation(); }} onPointerUp={event => { if (inspecting) event.stopPropagation(); }}
    onWheel={event => { if (inspecting) event.stopPropagation(); }} onKeyDown={event => { if (!inspecting) return; event.stopPropagation(); if (event.key === 'Escape') exit(); }}>
    {!loaded && <img className="model-poster" src={artwork(asset.id)} alt={`${name}, official artwork while 3D loads`} />}
    <div className="model-host" ref={host} aria-hidden={!loaded} />
    <div className="model-actions">
      {inspecting && <button onClick={() => setAngle(value => value - 30)} aria-label="Rotate model left">↶</button>}
      {loaded ? <button ref={inspectButton} onClick={() => inspecting ? exit() : setInspecting(true)}>{inspecting ? 'Done inspecting' : 'Inspect 3D'}</button> : <span role="status">Preparing 3D…</span>}
      {inspecting && <button onClick={() => setAngle(value => value + 30)} aria-label="Rotate model right">↷</button>}
      <button onClick={() => fallback.current()}>Use official art</button>
    </div>
  </div>;
}
