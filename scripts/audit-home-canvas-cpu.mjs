// Decode all review-only HOME candidates through the actual Three loader and
// material/rig preflight without claiming browser GPU playback or appearance.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import { prepareHomeEffects } from '../src/home-effects.js';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const catalog = await read('content/models/full-idle-candidates-2026-10-02.json');
const results = [];
for (const item of catalog.candidates) {
  const id = item.id;
  try {
    const bytes = await readFile(new URL(`../data/atlas-review/${id}-decoded.glb`, import.meta.url));
    const loader = new GLTFLoader();
    // Geometry/material metadata only: source PNG/WebP pixels were validated
    // independently, and no renderer/context is created in this CPU pass.
    loader.register(parser => { parser.loadTextureImage = () => Promise.resolve(new THREE.Texture());
      return { name: 'CPU_MATERIAL_PREFLIGHT_ONLY' }; });
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
    const effects = prepareHomeEffects(gltf, THREE);
    const result = { id, status: 'cpu-preflight-pass', duration: effects.duration,
      stencilRefs: effects.stencilRefs.length, visibilityNodes: effects.visibilityNodes.length,
      layeredMaterials: effects.layeredMaterialNames.length };
    effects.dispose();
    results.push(result);
  } catch (error) { results.push({ id, status: 'cpu-preflight-hold', reason: String(error.message) }); }
  if (results.length % 50 === 0) console.log(`${results.length}/${catalog.candidates.length} checked`);
}
const report = { checkedAt: '2026-10-02', scope: 'Three GLTFLoader plus HOME effect/rig CPU preflight only; texture pixels, GPU shaders and playback checked separately',
  candidates: results.length, pass: results.filter(item => item.status === 'cpu-preflight-pass').length,
  hold: results.filter(item => item.status === 'cpu-preflight-hold').length, results };
await writeFile(new URL('../data/atlas-review/canvas-preflight.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidates: report.candidates, pass: report.pass, hold: report.hold,
  failures: report.results.filter(item => item.status === 'cpu-preflight-hold') }));
