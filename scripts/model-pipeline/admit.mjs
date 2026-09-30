import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import ts from 'typescript';
import { runtimeManifest } from '../model-runtime-manifest.js';
const root = new URL('../../', import.meta.url);
const proposals = JSON.parse(await readFile(new URL('content/models/candidates.json', root), 'utf8'));
const previous = JSON.parse(await readFile(new URL('content/models/admitted.json', root), 'utf8')).filter(asset => asset.admitted);
const policy = (await readFile(new URL('src/model-policy.ts', root), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure, validateModelTextures } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
await MeshoptDecoder.ready;
const decoder = await draco.createDecoderModule();
sharp.concurrency(1); sharp.cache(false);
const results = [];
let cursor = 0, transferred = 0;
const started = Date.now();
await mkdir(new URL('public/models/', root), { recursive: true });
async function check(candidate) {
  try {
    if (Date.now() - started > 12 * 60 * 1000) throw new Error('batch time budget');
    let bytes;
    if (candidate.localArtifact) bytes = await readFile(new URL(candidate.localArtifact.replaceAll('\\', '/'), root));
    else {
      const response = await fetch(candidate.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok || !response.body) throw new Error(`source HTTP ${response.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length; transferred += chunk.length;
        if (size > candidate.bytes || size > 750000 || transferred > 100 * 1024 * 1024) throw new Error('batch transfer budget');
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    }
    if (bytes.length !== candidate.bytes || createHash('sha256').update(bytes).digest('hex') !== candidate.sha256) throw new Error('source identity changed');
    validateModelStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    await validateModelTextures(new Blob([bytes]), new AbortController().signal, async blob => {
      const image = sharp(Buffer.from(await blob.arrayBuffer()), { limitInputPixels: 2048 * 2048 });
      const { info } = await image.raw().toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, close() {} };
    });
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': decoder, 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.readBinary(bytes); doc.setLogger(new Logger(Logger.Verbosity.ERROR));
    let decoded = 0;
    for (const accessor of doc.getRoot().listAccessors()) {
      const values = accessor.getArray();
      if (!values) throw new Error('missing decoded geometry');
      decoded += values.byteLength;
      if (decoded > 32 * 1024 * 1024 || values.some(value => !Number.isFinite(value))) throw new Error('decoded geometry budget or nonfinite values');
    }
    if (!doc.getRoot().listMeshes().length || !doc.getRoot().listScenes().length) throw new Error('empty model');
    if (candidate.animation && !doc.getRoot().listAnimations().some(clip => clip.getName() === candidate.animation)) throw new Error('idle absent');
    if (candidate.localArtifact && !previous.some(asset => asset.id === candidate.id)) await copyFile(new URL(candidate.localArtifact.replaceAll('\\', '/'), root), new URL(`public${candidate.url}`, root));
    const { localArtifact, ...asset } = candidate;
    results.push({ ...asset, textureDecoded: true, geometryDecoded: true, decodedGeometryBytes: decoded,
      admissionBasis: 'source terms, byte identity, structure and decoded mobile budgets; representative browser QA required', admitted: true });
  } catch (error) { results.push({ ...candidate, admitted: false, admissionFailure: String(error.message) }); }
  if (results.length % 25 === 0) console.log(`${results.length}/${proposals.length} checked; ${results.filter(asset => asset.admitted).length} passed`);
}
await Promise.all([0, 1].map(async () => { while (cursor < proposals.length) await check(proposals[cursor++]); }));
// Keep the already reviewed optimized Mewtwo instead of its larger proposal.
const admitted = [...results.filter(asset => asset.admitted && !previous.some(old => old.id === asset.id)), ...previous].sort((a, b) => a.id - b.id);
await writeFile(new URL('content/models/admitted.json', root), JSON.stringify(runtimeManifest(admitted), null, 2) + '\n');
await writeFile(new URL('content/models/admission-report.json', root), JSON.stringify({ workers: 2, transferred, elapsedMs: Date.now() - started,
  proposed: proposals.length, admitted: admitted.length, visualReview: 'representative, not per-asset; runtime decoder/source fallback remains mandatory', results }, null, 2) + '\n');
console.log(`${admitted.length} admitted; ${results.filter(asset => !asset.admitted).length} rejected; ${transferred} remote bytes`);
