// Exact runtime-budget check for local source-screened HOME derivatives only.
// This writes review evidence to ignored data/, never to the admission manifest.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import ts from 'typescript';

const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.length > 3 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 1025) || new Set(ids).size !== ids.length) {
  throw new Error('Provide one to three unique screened species IDs');
}
const directory = new URL('../../data/native-idle-source-screen/', import.meta.url);
const policy = (await readFile(new URL('../../src/model-policy.ts', import.meta.url), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure, validateModelTextures } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco.createDecoderModule(),
});
sharp.concurrency(1); sharp.cache(false);
function binaryChunk(bytes) {
  const offset = 20 + bytes.readUInt32LE(12);
  return bytes.subarray(offset + 8);
}
for (const id of ids) {
  const report = JSON.parse(await readFile(new URL(`${id}.json`, directory), 'utf8'));
  if (report.id !== id || report.status !== 'source-screened-only' || report.admitted !== false || !report.derivative) {
    throw new Error(`Species ${id} has no screened derivative`);
  }
  const source = await readFile(new URL(`${id}-source.glb`, directory));
  const derivative = await readFile(new URL(`${id}-trimmed.glb`, directory));
  if (source.length !== report.source.bytes || derivative.length !== report.derivative.bytes ||
      createHash('sha256').update(source).digest('hex') !== report.source.sha256 ||
      createHash('sha256').update(derivative).digest('hex') !== report.derivative.sha256 ||
      !binaryChunk(source).equals(binaryChunk(derivative))) throw new Error(`Source or native binary changed for ${id}`);
  validateModelStructure(derivative.buffer.slice(derivative.byteOffset, derivative.byteOffset + derivative.length));
  await validateModelTextures(new Blob([derivative]), new AbortController().signal, async blob => {
    const image = sharp(Buffer.from(await blob.arrayBuffer()), { limitInputPixels: 2048 * 2048 });
    const { info } = await image.raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, close() {} };
  });
  const doc = await io.readBinary(derivative);
  let decodedAccessorBytes = 0;
  for (const accessor of doc.getRoot().listAccessors()) {
    const values = accessor.getArray();
    if (!values) throw new Error(`Missing decoded accessor for ${id}`);
    decodedAccessorBytes += values.byteLength;
    if (decodedAccessorBytes > 32 * 1024 * 1024 || values.some(value => !Number.isFinite(value))) {
      throw new Error(`Decoded geometry budget or nonfinite values for ${id}`);
    }
  }
  if (!doc.getRoot().listMeshes().length || !doc.getRoot().listScenes().length ||
      doc.getRoot().listAnimations().length !== 1 || doc.getRoot().listAnimations()[0].getName() !== report.derivative.animation) {
    throw new Error(`Decoded model or native idle missing for ${id}`);
  }
  const result = { id, status: 'decoded-budget-pass-only', admitted: false,
    sourceSha256: report.source.sha256, derivativeSha256: report.derivative.sha256,
    decodedAccessorBytes, meshes: doc.getRoot().listMeshes().length,
    skins: doc.getRoot().listSkins().length, animations: doc.getRoot().listAnimations().length,
    pending: ['three-pose and official-reference visual review', 'pose-aware camera sweep',
      'real-browser native playback', 'protected preview admission decision'] };
  await writeFile(new URL(`${id}-decoded-budget.json`, directory), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
