import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchModel, validateModelTextures, type ModelAsset } from './model-policy';
import { mountHomeCanvas, type HomeCanvasController } from './home-canvas-runtime.js';
import type { HomeLayerApproximationDisclosure } from './home-effects.js';
import './full-review.css';

type CorrectedSourceReview = {
  status: 'held-unverified-original-layer-equation' | 'metadata-preflight-pass';
  url: string; derivativeSha256: string; derivativeBytes: number; hosted: true;
  renderEquation: string; layerApproximationRequired: boolean; transferPolicy: string;
  heldMaterials: string[]; specialAtlasCompatibilityMaterials: Array<{ name: string; mode: string }>;
};
type Candidate = {
  id: number; name: string; publicRuntime: string; reviewStatus: 'needs-review' | 'broken-in-baseline';
  baselineVisualStatus: 'pass' | 'uncertain' | 'hold'; finding: string;
  url: string; bytes: number; sha256: string; sourceUrl: string; sourceSha256: string;
  animation: string; nativeDuration: number; sourceAuthoredStationaryWait: boolean;
  cpuRendererPreflight: 'pass'; browserGpuPlayback: 'unverified';
  correctedSourceReview: CorrectedSourceReview | null;
  features: { stencil: boolean; visibility: boolean; additive: string; rawGeometryUVReview: boolean };
  officialArt: string; credit: string; license: string; rightsStatus: string;
  originalHome: { geometry: { path: string }; nativeWait: { path: string } };
};
type SpeciesRow = {
  id: number; name: string; reviewStatus: 'candidate' | 'existing-public-inventory';
  correctedSourceReview: CorrectedSourceReview | null;
};
type Catalog = {
  counts: { totalSpecies: number; currentPublicModels: number; currentPublicNativeIdles: number;
    newVerifiedWorking: number; reviewCandidates: number; baselinePass: number; baselineUncertain: number;
    baselineHold: number; sourceAuthoredStationaryWait: number; reconstructedOriginalSceneReview: number;
    unverifiedLayerEquationHolds: number; exactTwoMegabyteReviewTransferExceptions: number };
  publicManifestSha256: string; species: SpeciesRow[]; candidates: Candidate[];
};
const art = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/bfb75391935310368065096fa08c51e8970bc43e/sprites/pokemon/other/official-artwork/${id}.png`;

function ReviewCanvas({ asset, name, officialArt, allowReviewLayerApproximation }: {
  asset: ModelAsset; name: string; officialArt: string; allowReviewLayerApproximation: boolean;
}) {
  const [runtime, setRuntime] = useState('Checking pinned bytes, textures and native idle…');
  const [playing, setPlaying] = useState(true);
  const [pose, setPose] = useState(-1);
  const [angle, setAngle] = useState(-12);
  const [inspecting, setInspecting] = useState(false);
  const [disclosures, setDisclosures] = useState<HomeLayerApproximationDisclosure[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<HomeCanvasController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setRuntime('Checking pinned bytes, textures and native idle…');
    setDisclosures([]);
    fetchModel(asset, controller.signal).then(async blob => {
      await validateModelTextures(blob, controller.signal);
      return mountHomeCanvas({ host: host.current!, bytes: await blob.arrayBuffer(), signal: controller.signal,
        dracoDecoderPath: '/model-runtime/draco/', allowReviewLayerApproximation,
        onFailure: reason => { if (active) setRuntime(`Renderer failed: ${String(reason)}`); } });
    }).then(result => {
      if (!active) { result.dispose(); return; }
      mounted.current = result;
      setDisclosures(result.layerApproximations);
      setRuntime('Rendered in this browser · visual identity and motion still require review');
    }).catch(reason => { if (active) setRuntime(`Could not render this candidate: ${String(reason)}`); });
    return () => { active = false; controller.abort(); mounted.current?.dispose(); mounted.current = null; };
  }, [asset.id, asset.url, asset.sha256, allowReviewLayerApproximation]);
  const ready = runtime.startsWith('Rendered');
  return <>
    <div className="review-stage"><div className="review-canvas-host" ref={host} />{!ready && <img className="review-stage-art" src={officialArt} alt={`${name} official artwork fallback`} />}</div>
    <p className="review-runtime" role="status">{runtime}</p>
    <div className="review-actions">
      <button disabled={!ready} onClick={() => { mounted.current?.setInspect(!inspecting); setInspecting(!inspecting); }}>{inspecting ? 'Stop orbiting' : 'Inspect / orbit'}</button>
      <button disabled={!ready} onClick={() => { mounted.current?.setAngle(angle - 45); setAngle(angle - 45); }}>↶ Rotate</button>
      <button disabled={!ready} onClick={() => { mounted.current?.setAngle(angle + 45); setAngle(angle + 45); }}>Rotate ↷</button>
      <button disabled={!ready} onClick={() => { if (playing) mounted.current?.pause(); else mounted.current?.play(); setPlaying(!playing); }}>{playing ? 'Pause idle' : 'Play idle'}</button>
      <button disabled={!ready} onClick={() => { const next = (pose + 1) % 3; mounted.current?.samplePose(next); setPose(next); }}>Still pose {pose < 0 ? 1 : (pose + 1) % 3 + 1}</button>
    </div>
    {disclosures.length > 0 && <div className="review-disclosures"><strong>Material approximations in this render</strong><ul>{disclosures.map((entry, index) =>
      <li key={`${entry.materialName}-${index}`}><strong>{entry.materialName}:</strong> {entry.disclosure}</li>)}</ul></div>}
  </>;
}

function Review() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(4);
  const [variant, setVariant] = useState<'baseline' | 'corrected'>('baseline');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/models/review-catalog.json', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('Protected review catalog unavailable');
      const result: Catalog = await response.json();
      if (result.species?.length !== 1025 || result.candidates?.length !== 478 ||
          result.counts?.reconstructedOriginalSceneReview !== 40 || result.counts?.newVerifiedWorking !== 0 ||
          result.publicManifestSha256 !== '69264fdafa834db8dc0d946901971ac01b0f1a3ae1f7dc820f7bbc5c1076e4a4') {
        throw Error('Review inventory mismatch');
      }
      setCatalog(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, []);
  const candidate = catalog?.candidates.find(item => item.id === selected);
  const selectedRow = catalog?.species.find(item => item.id === selected);
  const correction = selectedRow?.correctedSourceReview;
  const useCorrection = variant === 'corrected' && correction?.hosted;
  const baselineAsset = candidate ? { id: candidate.id, url: candidate.url, bytes: candidate.bytes,
    sha256: candidate.sha256, blobSha: '0'.repeat(40), admitted: false, reviewOnly: true,
    animation: candidate.animation, credit: candidate.credit, license: candidate.license,
    source: candidate.sourceUrl } satisfies ModelAsset : null;
  const correctedAsset = correction ? { id: selected, url: correction.url, bytes: correction.derivativeBytes,
    sha256: correction.derivativeSha256, blobSha: '0'.repeat(40), admitted: false, reviewOnly: true,
    animation: 'HOME Idle', credit: 'Original HOME source materials; Pokémon rights reserved',
    license: 'Unresolved extracted-asset rights; protected review only',
    source: 'https://github.com/Lilothestitch16/Pokemon-HOME-GLB-Models' } satisfies ModelAsset : null;
  const activeAsset = useCorrection ? correctedAsset : baselineAsset;
  const visible = useMemo(() => (catalog?.species ?? []).filter(item => {
    const detail = catalog?.candidates.find(candidate => candidate.id === item.id);
    const term = query.trim().toLowerCase();
    if (term && !item.name.toLowerCase().includes(term) && !String(item.id).includes(term)) return false;
    if (filter === 'candidates') return Boolean(detail);
    if (filter === 'holds') return detail?.baselineVisualStatus === 'hold';
    if (filter === 'uncertain') return detail?.baselineVisualStatus === 'uncertain';
    if (filter === 'baseline-pass') return detail?.baselineVisualStatus === 'pass';
    if (filter === 'material-holds') return item.correctedSourceReview?.status === 'held-unverified-original-layer-equation';
    return true;
  }), [catalog, query, filter]);
  if (error) return <main className="review-shell"><h1>Protected model review unavailable</h1><p>{error}</p><a href="/">Return to Pokédex</a></main>;
  if (!catalog) return <main className="review-shell"><h1>Loading protected model review…</h1></main>;
  return <main className="review-shell">
    <header className="review-heading"><div><p className="review-eyebrow">POKÉDEX · PROTECTED RESEARCH DRAFT</p><h1>Full species and idle review</h1>
      <p>All 1,025 species have pinned source models and native wait clips. The current public release remains {catalog.counts.currentPublicModels} models and {catalog.counts.currentPublicNativeIdles} native idles. New working admissions: {catalog.counts.newVerifiedWorking}.</p>
      <p className="review-warning">Extracted-asset redistribution rights remain unresolved. Source and CPU checks do not prove browser playback, corrected materials or public release readiness.</p></div><a href="/">Open public Pokédex ↗</a></header>
    <section className="review-totals" aria-label="Review counts"><span><strong>1,025</strong> source families</span><span><strong>478</strong> idle candidates</span><span><strong>{catalog.counts.baselinePass}</strong> CPU baseline pass</span><span><strong>{catalog.counts.baselineUncertain}</strong> uncertain</span><span><strong>{catalog.counts.baselineHold}</strong> baseline hold</span><span><strong>{catalog.counts.reconstructedOriginalSceneReview}</strong> original-scene drafts</span><span><strong>{catalog.counts.unverifiedLayerEquationHolds}</strong> source-shader holds</span></section>
    <div className="review-layout"><aside className="review-index"><label>Find species<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or Pokédex number" /></label>
      <label>Filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All 1,025</option><option value="candidates">All 478 candidates</option><option value="baseline-pass">CPU baseline pass</option><option value="uncertain">Uncertain</option><option value="holds">Baseline holds</option><option value="material-holds">Source-shader holds</option></select></label>
      <p>{visible.length} species shown</p><div className="review-list">{visible.map(item => {
        const entry = catalog.candidates.find(candidate => candidate.id === item.id);
        return <button key={item.id} onClick={() => { setSelected(item.id); setVariant('baseline'); }} aria-current={item.id === selected ? 'true' : undefined}><span>#{String(item.id).padStart(4, '0')} {item.name}</span><small className={entry?.baselineVisualStatus ?? ''}>{item.correctedSourceReview?.status === 'held-unverified-original-layer-equation' ? 'shader hold' : entry ? entry.baselineVisualStatus === 'hold' ? 'baseline hold' : entry.baselineVisualStatus === 'uncertain' ? 'uncertain' : 'needs review' : 'public inventory'}</small></button>;
      })}</div></aside>
      <section className="review-detail" aria-live="polite">
        <div className="review-identity"><img src={candidate?.officialArt ?? art(selected)} alt={`${selectedRow?.name} official artwork`} /><div><p>#{String(selected).padStart(4, '0')}</p><h2>{selectedRow?.name}</h2>
          <strong className={`review-status ${candidate?.baselineVisualStatus ?? ''}`}>{candidate ? candidate.reviewStatus === 'broken-in-baseline' ? 'Broken in CPU baseline' : 'Needs runtime and visual review' : 'Existing public inventory'}</strong>
          {candidate && <p>{candidate.finding}</p>}</div></div>
        {candidate ? <p>Native HOME Idle · {candidate.nativeDuration.toFixed(2)}s · Three CPU adapter preflight passed · browser GPU playback unverified</p> :
          <p>This species is already in the approved public inventory. The original-material variant below is a separate, unadmitted research draft.</p>}
        <div className="review-actions review-variant-actions">
          {candidate && <button aria-pressed={variant === 'baseline'} onClick={() => setVariant('baseline')}>Atlas baseline</button>}
          {correction && <button aria-pressed={variant === 'corrected'} onClick={() => setVariant('corrected')}>{correction.layerApproximationRequired ? 'Try disclosed shader approximation' : 'Try original-material review'}</button>}
        </div>
        {activeAsset && <ReviewCanvas key={`${selected}-${variant}`} asset={activeAsset} name={selectedRow?.name ?? String(selected)} officialArt={candidate?.officialArt ?? art(selected)} allowReviewLayerApproximation={Boolean(useCorrection)} />}
        {!activeAsset && <div className="review-empty"><p>No new review model for this already released species.</p><a href="/">View the public Pokédex ↗</a></div>}
        {candidate?.sourceAuthoredStationaryWait && <p className="review-warning">This original HOME wait clip is authentically stationary on the visible mesh. No procedural movement has been substituted.</p>}
        {candidate?.features.rawGeometryUVReview && variant === 'baseline' && <p className="review-warning">This optimized Atlas source lost some original secondary UVs. Layered material appearance may be wrong.</p>}
        {useCorrection && <p className="review-warning">Original HOME primitive/material assignments and native curves are retained. Layer colors use a concrete Atlas-style alpha-over visual-review approximation, not a recovered proprietary shader equation. Browser GPU appearance remains unverified.</p>}
        {correction?.status === 'held-unverified-original-layer-equation' && <p className="review-warning">Source-shader hold for {correction.heldMaterials.join(', ')}. The corrected draft is offered here only after selecting the disclosed approximation; it is not admitted.</p>}
        {correction?.specialAtlasCompatibilityMaterials.length && <p className="review-warning">Special materials use hash-pinned Atlas compatibility behavior for {correction.specialAtlasCompatibilityMaterials.map(item => item.name).join(', ')}; source shader equivalence is unverified.</p>}
        {correction?.transferPolicy === 'exact-protected-review-exception-2mb-mobile-performance-pending' && <p className="review-warning">The original-scene draft is {correction.derivativeBytes.toLocaleString()} bytes. Its exact hash-bound, on-demand protected-review transfer exception is under 2 MB; mobile performance remains unverified.</p>}
        {candidate && <p className="review-source">Pinned Atlas source: <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">HOME reconstruction ↗</a> · SHA-256 {candidate.sourceSha256}<br />Original geometry: {candidate.originalHome.geometry.path}<br />Original native wait: {candidate.originalHome.nativeWait.path}<br />{candidate.credit}<br />{candidate.license}</p>}
        {!candidate && correction && <p className="review-source">Local original-scene draft SHA-256 {correction.derivativeSha256}. No source binary is committed or added to the public release.</p>}
      </section></div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Review />);
