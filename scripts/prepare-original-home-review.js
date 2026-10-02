// Reconstruct original HOME scenes only in the exact SSO-protected review
// build. No extracted input or derivative binary is committed to Git.
import { readFile, writeFile, mkdir, readdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isProtectedFullReviewPreview } from './preview-model-context.js';
import { restoreOriginalHomeScene } from './model-pipeline/restore-original-home-scene.mjs';

const output = new URL('../public/models/', import.meta.url);
await mkdir(output, { recursive: true });
if (!isProtectedFullReviewPreview()) {
  for (const name of await readdir(output)) if (/^review-original-\d+\.glb$/.test(name)) {
    await rm(new URL(name, output), { force: true });
  }
  process.exit(0);
}

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const [inputs, derivatives] = await Promise.all([
  read('content/models/home-raw-scene-source-inputs-2026-10-02.json'),
  read('content/models/home-original-scene-review-2026-10-02.json'),
]);
if (inputs.species !== 40 || inputs.rows.length !== 40 || derivatives.rows.length !== 40) throw Error('Incomplete original HOME review inventory');
if (inputs.geometryRepository !== 'Lilothestitch16/Pokemon-HOME-GLB-Models' ||
    inputs.geometryRevision !== '27703273836f38f0e185976d955b1fbfb15448af' ||
    inputs.atlasRepository !== 'rrih/rrih.github.io' ||
    inputs.atlasRevision !== 'ef25889c60f099aa864bed11042f4054827a78c4' ||
    inputs.materialMotionRepository !== 'Lilothestitch16/Pokemon-HOME-Unity-Models' ||
    inputs.materialMotionRevision !== '7b18d1a3e22df48329220ea99c4d2a6617d72345' ||
    inputs.upstreamMap.sha256 !== '0b52b67120625b21d8e0f17c632897118b39adad02b175837fb90a95ae7f5983') {
  throw Error('Unapproved HOME source revision');
}
const byId = new Map(derivatives.rows.map(item => [item.id, item]));
if (byId.size !== 40) throw Error('Duplicate original HOME derivative');
for (const name of await readdir(output)) {
  const match = name.match(/^review-original-(\d+)\.glb$/);
  if (match && !byId.has(Number(match[1]))) await rm(new URL(name, output), { force: true });
}
const hash = (bytes, algorithm) => createHash(algorithm).update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const cached = new Set();
for (const item of inputs.rows) {
  const expected = byId.get(item.id);
  if (!expected) throw Error(`Missing original HOME review identity: ${item.id}`);
  try {
    const bytes = await readFile(new URL(`review-original-${item.id}.glb`, output));
    if (bytes.length === expected.derivative.bytes && hash(bytes, 'sha256') === expected.derivative.sha256) cached.add(item.id);
  } catch { /* A missing derivative is reconstructed from pinned input. */ }
}
if (cached.size === 40) {
  console.log('Protected original HOME review: reused 40 exact hash-verified derivatives');
  process.exit(0);
}
const encodePath = path => {
  if (typeof path !== 'string' || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw Error('Invalid pinned HOME source path');
  }
  return path.split('/').map(encodeURIComponent).join('/');
};
const rawURL = (repository, revision, path) =>
  `https://raw.githubusercontent.com/${repository}/${revision}/${encodePath(path)}`;
async function pinned(url, identity, label) {
  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(url) || !Number.isInteger(identity.bytes) || identity.bytes <= 0 ||
      identity.bytes > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(identity.sha256) || !/^[a-f0-9]{40}$/.test(identity.blobSha)) {
    throw Error(`Unbounded or unpinned HOME input: ${label}`);
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.body) throw Error(`HOME source unavailable: ${label} HTTP ${response.status}`);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > identity.bytes) throw Error(`HOME source exceeds pin: ${label}`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== identity.bytes || hash(bytes, 'sha256') !== identity.sha256 || gitBlob(bytes) !== identity.blobSha) {
    throw Error(`HOME source identity changed: ${label}`);
  }
  return bytes;
}
// The full upstream shader map is used only in memory and checked against its
// exact source identity. The Git repository retains a pointer, not that map.
const mapBytes = await pinned(inputs.upstreamMap.url, inputs.upstreamMap, 'upstream source map');
const sourceMap = JSON.parse(mapBytes);
if (sourceMap.geometryRevision !== inputs.geometryRevision || sourceMap.textureRevision !== inputs.materialMotionRevision) {
  throw Error('HOME material map revision drift');
}
// These are the repository's existing locked model-pipeline dependencies.
// The ordinary public build never installs them or prepares review assets.
try { await access(new URL('./model-pipeline/node_modules/sharp/package.json', import.meta.url)); }
catch {
  const run = promisify(execFile);
  await run('npm', ['ci', '--prefix', 'scripts/model-pipeline', '--no-audit', '--no-fund'],
    { cwd: new URL('../', import.meta.url).pathname, timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
}
const { optimizeOriginalHomeScene } = await import('./model-pipeline/optimize-original-home-scene.mjs');
const textureCache = new Map();
async function texture(identity) {
  const previous = textureCache.get(identity.path);
  if (previous && (previous.sha256 !== identity.sha256 || previous.bytes !== identity.bytes || previous.blobSha !== identity.blobSha)) {
    throw Error(`Conflicting pinned HOME texture: ${identity.path}`);
  }
  if (!previous) textureCache.set(identity.path, { ...identity, result: pinned(rawURL(inputs.materialMotionRepository,
    inputs.materialMotionRevision, identity.path), identity, identity.path) });
  return textureCache.get(identity.path).result;
}
let hosted = 0, held = 0;
for (const item of inputs.rows) {
  const expected = byId.get(item.id);
  if (!expected || expected.sourceGeometry.sha256 !== item.geometry.sha256 ||
      expected.atlasSourceSha256 !== item.atlas.sha256) throw Error(`Original HOME mapping changed: ${item.id}`);
  if (!['metadata-preflight-pass', 'held-unverified-original-layer-equation'].includes(expected.materialCorrectionStatus) ||
      expected.derivative.bytes <= 0 ||
      expected.derivative.bytes > 2_000_000) throw Error(`Unapproved HOME review derivative: ${item.id}`);
  if (expected.materialCorrectionStatus === 'held-unverified-original-layer-equation') held++;
  if (cached.has(item.id)) { hosted++; continue; }
  const materialMap = sourceMap.models?.[String(item.id)]?.materials;
  if (!materialMap || typeof materialMap !== 'object') throw Error(`Original HOME material map missing: ${item.id}`);
  const [rawBytes, atlasBytes, textureEntries] = await Promise.all([
    pinned(rawURL(inputs.geometryRepository, inputs.geometryRevision, item.geometry.path), item.geometry, `geometry ${item.id}`),
    pinned(rawURL(inputs.atlasRepository, inputs.atlasRevision, item.atlas.path), item.atlas, `Atlas ${item.id}`),
    Promise.all(item.textures.map(async identity => [identity.path, await texture(identity)])),
  ]);
  const reconstruction = restoreOriginalHomeScene({ id: item.id, rawBytes, atlasBytes,
    sourceMaterials: materialMap, textureBytesByPath: Object.fromEntries(textureEntries) });
  const derivative = await optimizeOriginalHomeScene(reconstruction.bytes);
  if (derivative.bytes.length !== expected.derivative.bytes || hash(derivative.bytes, 'sha256') !== expected.derivative.sha256 ||
      derivative.metrics.geometryAndCurvesByteExactAfterDecode !== true ||
      derivative.metrics.originalPngPixelsPreserved !== true) throw Error(`Original HOME derivative changed: ${item.id}`);
  await writeFile(new URL(`review-original-${item.id}.glb`, output), derivative.bytes);
  hosted++;
}
if (hosted !== 40 || held !== derivatives.counts.sourceLayerEquationHolds) throw Error('HOME review material hold count changed');
console.log(`Protected original HOME review: ${hosted} review-only derivatives prepared; ${held} require explicit shader-approximation review`);
