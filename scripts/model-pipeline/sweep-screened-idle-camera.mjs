// CPU-only pose-aware framing evidence. Uses the same Three.js vertex reducer
// and rest-pose camera equations as the pinned model-viewer runtime; no GPU or
// physical-device claim, and no admission-manifest mutation.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { reduceVertices } from 'three/examples/jsm/utils/SceneUtils.js';
import { AnimationMixer, Box3, LoopOnce, Texture, Vector3 } from 'three';

const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.length > 3 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 1025) || new Set(ids).size !== ids.length) {
  throw new Error('Provide one to three unique screened species IDs');
}
const directory = new URL('../../data/native-idle-source-screen/', import.meta.url);
const thetaDegrees = [-180, -90, -12, 0, 90, 180];
const phiDegrees = [35, 85, 145];
const aspectRatios = [0.5, 1, 2];
const cameraPercents = [110, 120, 130, 140, 150, 160, 165, 180, 200, 220, 240];
const rad = Math.PI / 180;
function vertices(scene) {
  const positions = [];
  reduceVertices(scene, (unused, position) => { positions.push(position.clone()); return unused; }, null);
  if (!positions.length || positions.some(position => ![position.x, position.y, position.z].every(Number.isFinite))) {
    throw new Error('No finite rendered vertices');
  }
  return positions;
}
for (const id of ids) {
  const report = JSON.parse(await readFile(new URL(`${id}.json`, directory), 'utf8'));
  if (report.id !== id || report.status !== 'source-screened-only' || report.admitted !== false || !report.derivative) {
    throw new Error(`Species ${id} has no screened derivative`);
  }
  const bytes = await readFile(new URL(`${id}-decoded.glb`, directory));
  const loader = new GLTFLoader();
  // Geometry-only CPU fixture: actual image bytes are separately checked by
  // validate-screened-idle.mjs. Override the parser before WEBP plugin use.
  loader.register(parser => { parser.loadTextureImage = () => Promise.resolve(new Texture()); return { name: 'CPU_GEOMETRY_ONLY' }; });
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  if (gltf.animations.length !== 1 || gltf.animations[0].name !== report.derivative.animation ||
      Math.abs(gltf.animations[0].duration - report.derivative.duration) > 0.0001) {
    throw new Error(`Native idle changed for ${id}`);
  }
  const bind = vertices(gltf.scene);
  const box = new Box3().setFromPoints(bind);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const bodyExtent = Math.max(size.x, size.y, size.z);
  const restRadius = Math.sqrt(Math.max(...bind.map(position => position.distanceToSquared(center))));
  if (!(bodyExtent > 0 && restRadius > 0)) throw new Error(`Degenerate bind frame for ${id}`);
  const tanHalfFov = Math.tan(35 * rad / 2);
  const idealDistance = restRadius / Math.sin(35 * rad / 2);
  const idealAspect = Math.max(...bind.map(position => {
    const delta = position.clone().sub(center);
    return Math.hypot(delta.x, delta.z) / (idealDistance - Math.abs(delta.y));
  })) / tanHalfFov;
  if (!Number.isFinite(idealAspect)) throw new Error(`Invalid ideal aspect for ${id}`);
  const mixer = new AnimationMixer(gltf.scene);
  const action = mixer.clipAction(gltf.animations[0]);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  mixer.setTime(0);
  const animatedStart = vertices(gltf.scene);
  if (animatedStart.length !== bind.length) throw new Error(`Vertex identity changed for ${id}`);
  const byDistance = Object.fromEntries(cameraPercents.map(percent => [percent, 0]));
  let maxAnimatedRadius = 0, maxDisplacement = 0, endpoint = null;
  for (let step = 0; step <= 96; step++) {
    mixer.setTime(gltf.animations[0].duration * step / 96);
    const positions = vertices(gltf.scene);
    if (positions.length !== bind.length) throw new Error(`Vertex count changed during idle for ${id}`);
    if (step === 96) endpoint = positions;
    for (let i = 0; i < positions.length; i++) {
      maxAnimatedRadius = Math.max(maxAnimatedRadius, positions[i].distanceTo(center));
      maxDisplacement = Math.max(maxDisplacement, positions[i].distanceTo(animatedStart[i]));
    }
    for (const theta of thetaDegrees) for (const phi of phiDegrees) {
      const direction = new Vector3(Math.sin(phi * rad) * Math.sin(theta * rad), Math.cos(phi * rad),
        Math.sin(phi * rad) * Math.cos(theta * rad));
      const forward = direction.clone().negate();
      const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
      const up = new Vector3().crossVectors(right, forward);
      for (const aspect of aspectRatios) {
        const tanVertical = tanHalfFov * Math.max(1, idealAspect / aspect);
        const tanHorizontal = tanVertical * aspect;
        for (const position of positions) {
          const offset = position.clone().sub(center);
          const x = Math.abs(offset.dot(right)), y = Math.abs(offset.dot(up));
          const towardCamera = offset.dot(direction);
          for (const percent of cameraPercents) {
            const depth = idealDistance * percent / 100 - towardCamera;
            const extent = depth <= 0 ? Infinity : Math.max(x / (depth * tanHorizontal), y / (depth * tanVertical));
            byDistance[percent] = Math.max(byDistance[percent], extent);
          }
        }
      }
    }
  }
  const loopRelativeDisplacement = Math.max(...endpoint.map((position, index) => position.distanceTo(animatedStart[index]))) / bodyExtent;
  const selected = cameraPercents.find(percent => byDistance[percent] <= 0.95) ?? null;
  const result = {
    id, status: 'bounded-cpu-framing-review', admitted: false,
    derivativeSha256: report.derivative.sha256,
    decodedSha256: createHash('sha256').update(bytes).digest('hex'),
    method: 'Three.js 0.183.2 GLTFLoader and AnimationMixer; model-viewer 4.3.1 reduceVertices and pre-animation bind framing equations; geometry-only texture stub with separate decoded-pixel validation',
    sampledPoses: 97, cameraConfigurations: thetaDegrees.length * phiDegrees.length * aspectRatios.length,
    thetaDegrees, phiDegrees, aspectRatios, vertices: bind.length,
    bindCenter: center.toArray(), restRadius, bodyExtent, idealAspect,
    bindToAnimatedStartRelativeDisplacement: Math.max(...animatedStart.map((position, index) => position.distanceTo(bind[index]))) / bodyExtent,
    maxAnimatedRadius, relativeDisplacement: maxDisplacement / bodyExtent,
    loopRelativeDisplacement, maxNormalizedExtentByCameraPercent: byDistance,
    minimumSampledClearCameraPercent: selected, allSampledViewsWithinFrame: selected !== null,
    gpuPlaybackVerified: false,
  };
  await writeFile(new URL(`${id}-camera.json`, directory), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ id, vertices: result.vertices, relativeDisplacement: result.relativeDisplacement,
    loopRelativeDisplacement, cameraPercent: selected, maxExtent: selected === null ? null : byDistance[selected] }));
}
