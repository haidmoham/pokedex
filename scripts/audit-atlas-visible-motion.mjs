// Per-species geometry-only native idle movement/loop diagnostic for the
// complete 478-species current gap. This is not an appearance or GPU pass.
import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { reduceVertices } from 'three/examples/jsm/utils/SceneUtils.js';
import { AnimationMixer, Box3, LoopOnce, Texture, Vector3 } from 'three';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('content/models/atlas-source-catalog-2026-10-02.json', root), 'utf8'));
const candidates = catalog.records.filter(item => item.currentPublicRuntime !== 'native-idle');
if (candidates.length !== 478) throw Error('Current native-idle gap changed');
function vertices(scene) {
  const result = [];
  reduceVertices(scene, (unused, point) => { result.push(point.clone()); return unused; }, null);
  return result;
}
function median(values) {
  values.sort((a, b) => a - b);
  return values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
}
const results = [];
for (const entry of candidates) {
  const { id } = entry;
  try {
    const bytes = await readFile(new URL(`data/atlas-review/${id}-decoded.glb`, root));
    const loader = new GLTFLoader();
    loader.register(parser => { parser.loadTextureImage = () => Promise.resolve(new Texture()); return { name: 'CPU_GEOMETRY_ONLY' }; });
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
    if (gltf.animations.length !== 1 || gltf.animations[0].name !== 'HOME Idle') throw Error('Missing native idle');
    const bind = vertices(gltf.scene);
    if (!bind.length) throw Error('No visible geometry');
    const extent = new Box3().setFromPoints(bind).getSize(new Vector3());
    const bodyExtent = Math.max(extent.x, extent.y, extent.z);
    if (!(bodyExtent > 0)) throw Error('Degenerate bind geometry');
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
    mixer.setTime(0);
    const start = vertices(gltf.scene);
    if (start.length !== bind.length) throw Error('Vertex count changed at start');
    const maximum = Array(start.length).fill(0);
    for (const phase of [0.125, 0.375, 0.625]) {
      mixer.setTime(gltf.animations[0].duration * phase);
      const points = vertices(gltf.scene);
      if (points.length !== start.length) throw Error('Vertex count changed during native idle');
      for (let index = 0; index < points.length; index++) {
        maximum[index] = Math.max(maximum[index], points[index].distanceTo(start[index]));
      }
    }
    mixer.setTime(gltf.animations[0].duration);
    const endpoint = vertices(gltf.scene);
    if (endpoint.length !== start.length) throw Error('Vertex count changed at loop endpoint');
    let seam = 0, max = 0;
    for (let index = 0; index < endpoint.length; index++) {
      seam = Math.max(seam, endpoint[index].distanceTo(start[index]));
      max = Math.max(max, maximum[index]);
    }
    const middle = median(maximum);
    results.push({ id, status: 'geometry-motion-measured', sourceSha256: entry.atlas.sha256,
      duration: gltf.animations[0].duration, vertices: start.length, bodyExtent,
      maxWorldDisplacement: max, medianWorldDisplacement: middle,
      maxRelativeDisplacement: max / bodyExtent, medianRelativeDisplacement: middle / bodyExtent,
      loopRelativeDisplacement: seam / bodyExtent,
      caveat: 'Three.js CPU skinned geometry; visibility/effects, material appearance and GPU playback not certified' });
  } catch (error) { results.push({ id, status: 'motion-measurement-failed', error: String(error.message) }); }
  if (results.length % 50 === 0 || results.length === candidates.length) console.log(`Motion ${results.length}/${candidates.length}`);
}
const output = { checkedAt: '2026-10-02', target: candidates.length,
  measured: results.filter(item => item.status === 'geometry-motion-measured').length,
  failed: results.filter(item => item.status === 'motion-measurement-failed').length, results };
await writeFile(new URL('data/atlas-review/motion-diagnostics.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ target: output.target, measured: output.measured, failed: output.failed }));
if (output.failed) process.exitCode = 1;
