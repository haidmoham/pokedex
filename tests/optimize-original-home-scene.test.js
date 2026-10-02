import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { readGlb, writeGlb } from '../scripts/model-pipeline/restore-original-home-scene.mjs';
import { compressOriginalHomeScene, deduplicateNativeAccessors,
  optimizeOriginalHomeScene, reencodeOriginalPngLossless } from '../scripts/model-pipeline/optimize-original-home-scene.mjs';

const require = createRequire(new URL('../scripts/model-pipeline/package.json', import.meta.url));
const sharp = require('sharp');

async function fixture() {
  const image = await sharp({ create: { width: 32, height: 32, channels: 4,
    background: { r: 120, g: 40, b: 210, alpha: 1 } } }).png({ compressionLevel: 0 }).toBuffer();
  const binary = Buffer.alloc(1244 + image.length);
  binary.writeFloatLE(0, 1188); binary.writeFloatLE(1, 1192);
  binary.set(image, 1244);
  const json = {
    asset: { version: '2.0', extras: { homeReconstruction: { status: 'local-review-only' } } },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 1188 },
      { buffer: 0, byteOffset: 1188, byteLength: 8 },
      { buffer: 0, byteOffset: 1196, byteLength: 24 },
      { buffer: 0, byteOffset: 1220, byteLength: 24 },
      { buffer: 0, byteOffset: 1244, byteLength: image.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 99, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    textures: [{ source: 0 }],
    materials: [{ name: 'Body', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ name: 'Body', primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ name: 'Body', mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [{ name: 'HOME Idle', extras: { homeDuration: 1 },
      samplers: [{ input: 1, output: 2, interpolation: 'LINEAR' },
        { input: 1, output: 3, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } },
        { sampler: 1, target: { node: 0, path: 'scale' } }] }],
  };
  return writeGlb(json, binary);
}

test('deduplicates identical native payloads and compresses exact numeric bytes', async () => {
  const source = await fixture();
  const packed = deduplicateNativeAccessors(source);
  assert.equal(packed.removedAccessors, 1);
  assert.equal(readGlb(packed.bytes).json.animations[0].samplers[0].output,
    readGlb(packed.bytes).json.animations[0].samplers[1].output);
  const compressed = await compressOriginalHomeScene(packed.bytes);
  assert.ok(compressed.bytes.length < packed.bytes.length);
  const result = readGlb(compressed.bytes);
  assert.ok(result.json.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.equal(result.json.meshes[0].primitives[0].material, 0);
  const combined = await optimizeOriginalHomeScene(source);
  assert.equal(combined.metrics.geometryAndCurvesByteExactAfterDecode, true);
  assert.equal(combined.metrics.originalPngBytesPreserved, true);
  assert.equal(combined.metrics.published, false);
});

test('optional PNG recompression preserves decoded pixel bytes', async () => {
  const source = await fixture(), before = readGlb(source);
  const changed = await reencodeOriginalPngLossless(source), after = readGlb(changed.bytes);
  assert.equal(changed.reencodedPngCount, 1);
  assert.ok(changed.savedPngBytes > 1000);
  const originalView = before.json.bufferViews[before.json.images[0].bufferView];
  const newView = after.json.bufferViews[after.json.images[0].bufferView];
  const originalPng = before.binary.subarray(originalView.byteOffset, originalView.byteOffset + originalView.byteLength);
  const newPng = after.binary.subarray(newView.byteOffset, newView.byteOffset + newView.byteLength);
  assert.deepEqual(await sharp(originalPng).raw().toBuffer(), await sharp(newPng).raw().toBuffer());
});

test('rejects derivatives without explicit review-only origin', async () => {
  const source = await fixture(), { json, binary } = readGlb(source);
  delete json.asset.extras.homeReconstruction;
  assert.throws(() => deduplicateNativeAccessors(writeGlb(json, binary)), /review reconstruction required/);
});
