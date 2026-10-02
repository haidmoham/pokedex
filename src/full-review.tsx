import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchModel, validateModelTextures, type ModelAsset } from './model-policy';
import { mountHomeCanvas, type HomeCanvasController } from './home-canvas-runtime.js';
import './full-review.css';

type Candidate = { id: number; name: string; publicRuntime: string; reviewStatus: 'needs-review' | 'broken-in-baseline';
  baselineVisualStatus: 'pass' | 'uncertain' | 'hold'; finding: string; url: string; bytes: number; sha256: string;
  sourceUrl: string; sourceSha256: string; animation: string; nativeDuration: number; sourceAuthoredStationaryWait: boolean;
  cpuRendererPreflight: 'pass'; browserGpuPlayback: 'unverified';
  features: { stencil: boolean; visibility: boolean; additive: string; rawGeometryUVReview: boolean };
  officialArt: string; credit: string; license: string; rightsStatus: string; originalHome: { geometry: { path: string }; nativeWait: { path: string } } };
type SpeciesRow = { id: number; name: string; reviewStatus: 'candidate' | 'existing-public-inventory' };
type Catalog = { counts: { totalSpecies: number; currentPublicModels: number; currentPublicNativeIdles: number;
  newVerifiedWorking: number; reviewCandidates: number; baselinePass: number; baselineUncertain: number; baselineHold: number;
  sourceAuthoredStationaryWait: number }; publicManifestSha256: string; species: SpeciesRow[]; candidates: Candidate[] };

function Review() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(4);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [runtime, setRuntime] = useState('Select a candidate to load its pinned source');
  const [playing, setPlaying] = useState(true);
  const [pose, setPose] = useState(-1);
  const [angle, setAngle] = useState(-12);
  const [inspecting, setInspecting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<HomeCanvasController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/models/review-catalog.json', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('Protected review catalog unavailable');
      const result: Catalog = await response.json();
      if (result.species?.length !== 1025 || result.candidates?.length !== 478 ||
          result.counts?.newVerifiedWorking !== 0 || result.publicManifestSha256 !== '69264fdafa834db8dc0d946901971ac01b0f1a3ae1f7dc820f7bbc5c1076e4a4') {
        throw Error('Review inventory mismatch');
      }
      setCatalog(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, []);
  const candidate = catalog?.candidates.find(item => item.id === selected);
  const visible = useMemo(() => (catalog?.species ?? []).filter(item => {
    const detail = catalog?.candidates.find(candidate => candidate.id === item.id);
    const term = query.trim().toLowerCase();
    if (term && !item.name.toLowerCase().includes(term) && !String(item.id).includes(term)) return false;
    if (filter === 'candidates') return Boolean(detail);
    if (filter === 'holds') return detail?.baselineVisualStatus === 'hold';
    if (filter === 'uncertain') return detail?.baselineVisualStatus === 'uncertain';
    if (filter === 'baseline-pass') return detail?.baselineVisualStatus === 'pass';
    return true;
  }), [catalog, query, filter]);
  useEffect(() => {
    mounted.current?.dispose(); mounted.current = null;
    if (!candidate || !host.current) { setRuntime('Choose a native-idle candidate'); return; }
    const controller = new AbortController();
    let active = true;
    setRuntime('Checking pinned bytes, textures and native idle…');
    setPose(-1); setPlaying(true); setInspecting(false); setAngle(-12);
    const asset = { ...candidate, blobSha: candidate.sha256.slice(0, 40), admitted: false,
      source: candidate.sourceUrl } as ModelAsset;
    fetchModel(asset, controller.signal).then(async blob => {
      await validateModelTextures(blob, controller.signal);
      return mountHomeCanvas({ host: host.current!, bytes: await blob.arrayBuffer(), signal: controller.signal,
        dracoDecoderPath: '/model-runtime/draco/', onFailure: reason => {
          if (active) setRuntime(`Renderer failed: ${String(reason)}`);
        } });
    }).then(result => {
      if (!active) { result.dispose(); return; }
      mounted.current = result;
      setRuntime('Rendered in this browser · visual identity and motion still require review');
    }).catch(reason => { if (active) setRuntime(`Could not render this candidate: ${String(reason)}`); });
    return () => { active = false; controller.abort(); mounted.current?.dispose(); mounted.current = null; };
  }, [candidate?.id, candidate?.sha256]);
  if (error) return <main className="review-shell"><h1>Protected model review unavailable</h1><p>{error}</p><a href="/">Return to Pokédex</a></main>;
  if (!catalog) return <main className="review-shell"><h1>Loading protected model review…</h1></main>;
  return <main className="review-shell">
    <header className="review-heading"><div><p className="review-eyebrow">POKÉDEX · PROTECTED RESEARCH DRAFT</p><h1>Full species and idle review</h1>
      <p>All 1,025 species have pinned source models and native wait clips. The current public release remains {catalog.counts.currentPublicModels} models and {catalog.counts.currentPublicNativeIdles} native idles. New working admissions: {catalog.counts.newVerifiedWorking}.</p>
      <p className="review-warning">Extracted-asset redistribution rights remain unresolved. Source and CPU checks do not prove browser playback, corrected materials or public release readiness.</p></div><a href="/">Open public Pokédex ↗</a></header>
    <section className="review-totals" aria-label="Review counts"><span><strong>1,025</strong> source families</span><span><strong>478</strong> idle candidates</span><span><strong>{catalog.counts.baselinePass}</strong> CPU baseline pass</span><span><strong>{catalog.counts.baselineUncertain}</strong> uncertain</span><span><strong>{catalog.counts.baselineHold}</strong> baseline hold</span></section>
    <div className="review-layout"><aside className="review-index"><label>Find species<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or Pokédex number" /></label>
      <label>Filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All 1,025</option><option value="candidates">All 478 candidates</option><option value="baseline-pass">CPU baseline pass</option><option value="uncertain">Uncertain</option><option value="holds">Baseline holds</option></select></label>
      <p>{visible.length} species shown</p><div className="review-list">{visible.map(item => {
        const entry = catalog.candidates.find(candidate => candidate.id === item.id);
        return <button key={item.id} onClick={() => setSelected(item.id)} aria-current={item.id === selected ? 'true' : undefined}><span>#{String(item.id).padStart(4, '0')} {item.name}</span><small className={entry?.baselineVisualStatus ?? ''}>{entry ? entry.baselineVisualStatus === 'hold' ? 'baseline hold' : entry.baselineVisualStatus === 'uncertain' ? 'uncertain' : 'needs review' : 'public inventory'}</small></button>;
      })}</div></aside>
      <section className="review-detail" aria-live="polite">{candidate ? <><div className="review-identity"><img src={candidate.officialArt} alt={`${candidate.name} official artwork`} /><div><p>#{String(candidate.id).padStart(4, '0')}</p><h2>{candidate.name}</h2><strong className={`review-status ${candidate.baselineVisualStatus}`}>{candidate.reviewStatus === 'broken-in-baseline' ? 'Broken in CPU baseline' : 'Needs runtime and visual review'}</strong><p>{candidate.finding}</p></div></div>
        <p>Native HOME Idle · {candidate.nativeDuration.toFixed(2)}s · Three CPU adapter preflight passed · browser GPU playback unverified</p>
        <div className="review-stage" ref={host} /><p className="review-runtime" role="status">{runtime}</p><div className="review-actions"><button onClick={() => { mounted.current?.setInspect(!inspecting); setInspecting(!inspecting); }}>{inspecting ? 'Stop orbiting' : 'Inspect / orbit'}</button><button onClick={() => { mounted.current?.setAngle(angle - 45); setAngle(angle - 45); }}>↶ Rotate</button><button onClick={() => { mounted.current?.setAngle(angle + 45); setAngle(angle + 45); }}>Rotate ↷</button><button onClick={() => { if (playing) mounted.current?.pause(); else mounted.current?.play(); setPlaying(!playing); }}>{playing ? 'Pause idle' : 'Play idle'}</button><button onClick={() => { const next = (pose + 1) % 3; mounted.current?.samplePose(next); setPose(next); }}>Still pose {pose < 0 ? 1 : (pose + 1) % 3 + 1}</button></div>
        {candidate.sourceAuthoredStationaryWait && <p className="review-warning">This original HOME wait clip is authentically stationary on the visible mesh. No procedural movement has been substituted.</p>}
        {candidate.features.rawGeometryUVReview && <p className="review-warning">Layered UV correction is not yet validated on this optimized source. Material appearance may be wrong.</p>}
        <p className="review-source">Pinned source: <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">HOME reconstruction ↗</a> · SHA-256 {candidate.sourceSha256}<br />Original geometry: {candidate.originalHome.geometry.path}<br />Original native wait: {candidate.originalHome.nativeWait.path}<br />{candidate.credit}<br />{candidate.license}</p>
      </> : <div className="review-empty"><h2>Existing public inventory</h2><p>This species is already in the 998-model public release. New candidate review applies to the remaining 478 native-idle gaps.</p><a href="/">View the public Pokédex ↗</a></div>}</section></div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Review />);
