import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO, Logger, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import ts from 'typescript';
import { selectedIdle } from '../model-candidate-policy.js';
import { geometryValuesHash } from './geometry.mjs';
const [input, output, metrics, sizeArgument = '512'] = process.argv.slice(2);
const textureSize = Number(sizeArgument);
if (![256, 512].includes(textureSize)) throw new Error('texture size must be 256 or 512');
sharp.concurrency(1);
sharp.cache(false);
const policy = (await readFile(new URL('../../src/model-policy.ts', import.meta.url), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure, validateModelTextures } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const original = await readFile(input);
const sourceJSON = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)).toString('utf8'));
if ((sourceJSON.buffers ?? []).some(buffer => buffer.uri) || (sourceJSON.images ?? []).some(image => image.uri) ||
  (sourceJSON.buffers ?? []).reduce((total, buffer) => total + buffer.byteLength, 0) > 128 * 1024 * 1024) throw new Error('source decode exceeds processing bounds');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.readBinary(original);
doc.setLogger(new Logger(Logger.Verbosity.ERROR));
const accessorIdentity = (accessor, triangleIndices = false) => {
  if (!accessor) return null;
  const array = accessor.getArray();
  return { count: accessor.getCount(), normalized: accessor.getNormalized(),
    hash: geometryValuesHash(array, triangleIndices) };
};
const geometry = document => document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives().map(primitive => ({
  mode: primitive.getMode(), vertices: primitive.getAttribute('POSITION')?.getCount() ?? 0,
  indices: primitive.getIndices()?.getCount() ?? 0,
  attributes: Object.fromEntries(primitive.listSemantics().sort().map(semantic => [semantic, accessorIdentity(primitive.getAttribute(semantic))])),
  indexIdentity: accessorIdentity(primitive.getIndices(), primitive.getMode() === 4),
  morphTargets: primitive.listTargets().map(target => Object.fromEntries(target.listSemantics().sort().map(semantic => [semantic, accessorIdentity(target.getAttribute(semantic))]))),
})));
const before = geometry(doc);
const animation = selectedIdle(doc.getRoot().listAnimations().map(clip => clip.getName()));
for (const clip of doc.getRoot().listAnimations()) {
  if (clip.getName() === animation) continue;
  for (const channel of clip.listChannels()) channel.dispose();
  for (const sampler of clip.listSamplers()) sampler.dispose();
  clip.dispose();
}
for (const extension of doc.getRoot().listExtensionsUsed()) if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression'].includes(extension.extensionName)) extension.dispose();
await doc.transform(dedup({ propertyTypes: [PropertyType.TEXTURE] }), prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER, PropertyType.ANIMATION, PropertyType.TEXTURE], keepExtras: true, keepAttributes: true, keepLeaves: true, keepSolidTextures: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 90, limitInputPixels: 16 * 1024 * 1024 }));
// Compression only: no simplify, weld, reorder or position quantization.
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const encoded = Buffer.from(await io.writeBinary(doc));
const oldJSONLength = encoded.readUInt32LE(12);
const json = JSON.parse(encoded.subarray(20, 20 + oldJSONLength).toString('utf8'));
json.asset.extras = sourceJSON.asset.extras ?? {};
const jsonBytes = Buffer.from(JSON.stringify(json));
const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 32);
jsonBytes.copy(padded);
const bytes = Buffer.concat([encoded.subarray(0, 20), padded, encoded.subarray(20 + oldJSONLength)]);
bytes.writeUInt32LE(bytes.length, 8);
bytes.writeUInt32LE(padded.length, 12);
const roundtrip = await io.readBinary(bytes);
const geometryPreserved = JSON.stringify(before) === JSON.stringify(geometry(roundtrip));
if (!geometryPreserved) {
  await writeFile(`${metrics}.geometry-debug.json`, JSON.stringify({ before, after: geometry(roundtrip) }, null, 2));
  throw new Error('geometry changed in roundtrip');
}
let machineFailure = null;
try {
  if (bytes.length > 750000) throw new Error('transfer exceeds 750 KB');
  validateModelStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await validateModelTextures(new Blob([bytes]), new AbortController().signal, async blob => {
    const image = sharp(Buffer.from(await blob.arrayBuffer()), { limitInputPixels: 2048 * 2048 });
    const { info } = await image.raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, close() {} };
  });
} catch (error) { machineFailure = error.message; }
await writeFile(output, bytes);
await writeFile(metrics, JSON.stringify({ originalBytes: original.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  textureSize, geometryPreserved, animation, textureDecoded: !machineFailure, machineFailure, sourceExtras: sourceJSON.asset.extras ?? {},
  visualReviewed: false, admitted: false }, null, 2));
