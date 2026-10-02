// Exhaustive decoded-budget and native-motion diagnostic for all 1,025 pinned
// Atlas sources. No admissions, generated assets, or deployment changes.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { trimHomeIdle } from './trim-home-idle.js';

const requirePipeline = createRequire(new URL('./model-pipeline/package.json', import.meta.url));
const { NodeIO, Logger } = requirePipeline('@gltf-transform/core');
const { ALL_EXTENSIONS } = requirePipeline('@gltf-transform/extensions');
const { MeshoptDecoder } = requirePipeline('meshoptimizer');
const draco = requirePipeline('draco3dgltf');
const sharp = requirePipeline('sharp');
const root = new URL('../', import.meta.url);
const source = JSON.parse(await readFile(new URL('content/models/atlas-source-catalog-2026-10-02.json', root), 'utf8'));
if (source.records.length !== 1025 || source.counts.sourceFilesVerified !== 1025) throw Error('Incomplete full source catalog');
const policy = (await readFile(new URL('src/model-policy.ts', root), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco.createDecoderModule(),
});
sharp.concurrency(1); sharp.cache(false);
const results = [];
for (const entry of source.records) {
  const { id } = entry;
  const bytes = await readFile(new URL(`data/atlas-git/${entry.atlas.path}`, root));
  const prepared = trimHomeIdle(bytes);
  const preparedBuffer = prepared.bytes.buffer.slice(prepared.bytes.byteOffset, prepared.bytes.byteOffset + prepared.bytes.length);
  let existingStructure = 'pass';
  try { validateModelStructure(preparedBuffer); } catch (error) { existingStructure = String(error.message); }
  const gltf = JSON.parse(prepared.bytes.subarray(20, 20 + prepared.bytes.readUInt32LE(12)).toString('utf8'));
  const binaryOffset = 20 + prepared.bytes.readUInt32LE(12) + 8;
  let decodedTextureBytes = 0;
  let textureFailure = null;
  try {
    for (const image of gltf.images ?? []) {
      const view = gltf.bufferViews?.[image.bufferView];
      if (!view || view.buffer !== 0 || view.extensions || !Number.isSafeInteger(view.byteLength) ||
          view.byteLength <= 0 || !Number.isSafeInteger(view.byteOffset ?? 0) ||
          binaryOffset + (view.byteOffset ?? 0) + view.byteLength > prepared.bytes.length) throw Error('invalid embedded texture');
      const data = prepared.bytes.subarray(binaryOffset + (view.byteOffset ?? 0), binaryOffset + (view.byteOffset ?? 0) + view.byteLength);
      const { info } = await sharp(data, { limitInputPixels: 2048 * 2048 }).raw().toBuffer({ resolveWithObject: true });
      decodedTextureBytes += info.width * info.height * 4 * 4 / 3;
      if (info.width > 2048 || info.height > 2048 || decodedTextureBytes > 32 * 1024 * 1024) throw Error('decoded texture exceeds budget');
    }
  } catch (error) { textureFailure = String(error.message); }
  let decodedAccessorBytes = 0, movingSamplers = 0, decodedFailure = null;
  try {
    const document = await io.readBinary(prepared.bytes);
    document.setLogger(new Logger(Logger.Verbosity.ERROR));
    for (const accessor of document.getRoot().listAccessors()) {
      const values = accessor.getArray();
      if (!values) throw Error('missing decoded accessor');
      decodedAccessorBytes += values.byteLength;
      if (decodedAccessorBytes > 32 * 1024 * 1024 || values.some(value => !Number.isFinite(value))) throw Error('decoded geometry budget or nonfinite values');
    }
    const clips = document.getRoot().listAnimations();
    if (!document.getRoot().listMeshes().length || !document.getRoot().listScenes().length ||
        clips.length !== 1 || clips[0].getName() !== 'HOME Idle') throw Error('missing decoded model or native idle');
    for (const sampler of clips[0].listSamplers()) {
      const output = sampler.getOutput();
      const values = output?.getArray();
      const keys = sampler.getInput()?.getCount();
      const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
      const factor = cubic ? 3 : 1;
      const width = values?.length / (keys * factor);
      if (!values || !Number.isSafeInteger(keys) || keys <= 0 || !Number.isSafeInteger(width) || width <= 0) {
        throw Error('missing native curve output');
      }
      // CUBICSPLINE records are tangent/value/tangent. Moving tangents alone
      // do not make a visible idle; compare source-authored key values only.
      const first = cubic ? width : 0;
      let moving = false;
      for (let key = 1; key < keys && !moving; key++) for (let component = 0; component < width; component++) {
        if (Math.abs(values[key * factor * width + first + component] - values[first + component]) > 1e-6) {
          moving = true; break;
        }
      }
      if (moving) movingSamplers++;
    }
  } catch (error) { decodedFailure = String(error.message); }
  results.push({ id, sourceSha256: entry.atlas.sha256, derivativeSha256: entry.sourceOnlyTrim.sha256,
    derivativeBytes: entry.sourceOnlyTrim.bytes, transferBudgetPass: entry.sourceOnlyTrim.transferBudgetPass,
    existingStructure, decodedTextureBytes, textureFailure, decodedAccessorBytes, movingSamplers, decodedFailure,
    customRuntimeFlags: entry.customRuntimeFlags });
  if (id % 100 === 0 || id === 1025) console.log(`Audited ${id}/1025`);
}
const counts = {
  sources: results.length,
  transferBudgetPass: results.filter(result => result.transferBudgetPass).length,
  existingStructurePass: results.filter(result => result.existingStructure === 'pass').length,
  decodedTexturePass: results.filter(result => !result.textureFailure).length,
  decodedGeometryAndIdlePass: results.filter(result => !result.decodedFailure).length,
  actualMovingNativeIdle: results.filter(result => !result.decodedFailure && result.movingSamplers > 0).length,
};
const output = { checkedAt: '2026-10-02', scope: 'Decoded CPU resource and native-motion audit; no appearance, renderer, public-release or rights approval', counts, results };
await writeFile(new URL('content/models/atlas-runtime-audit-2026-10-02.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(counts, null, 2));
