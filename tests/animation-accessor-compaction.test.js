import test from 'node:test';
import assert from 'node:assert/strict';
import { compactAnimationAccessors } from '../scripts/compact-animation-accessors.js';

function glb(json, binary = Buffer.alloc(16)) {
  const raw = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(padded);
  const out = Buffer.alloc(28 + padded.length + binary.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); padded.copy(out, 20);
  out.writeUInt32LE(binary.length, 20 + padded.length); out.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(out, 28 + padded.length);
  return out;
}
function parsed(bytes) { return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12))); }
function binary(bytes) { return bytes.subarray(28 + bytes.readUInt32LE(12)); }

test('identical native animation accessors compact without changing curve metadata or binary bytes', () => {
  const shared = { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] };
  const gltf = { asset: { version: '2.0' }, accessors: [shared, { ...shared },
    { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' }],
    animations: [{ name: 'HOME Idle', samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 2 } }] }] };
  const source = glb(gltf);
  const result = compactAnimationAccessors(source);
  const compacted = parsed(result.bytes);
  assert.equal(result.removed, 1);
  assert.deepEqual(compacted.accessors, [shared, gltf.accessors[2]]);
  assert.deepEqual(compacted.animations[0].samplers, [{ input: 0, output: 0, interpolation: 'LINEAR' }]);
  assert.equal(compacted.meshes[0].primitives[0].attributes.POSITION, 1);
  assert.deepEqual(binary(result.bytes), binary(source));
});

test('shared geometry-animation accessor is rejected instead of deduplicated', () => {
  const source = glb({ asset: { version: '2.0' }, accessors: [{ bufferView: 0, count: 1 }],
    animations: [{ samplers: [{ input: 0, output: 0 }] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] });
  assert.throws(() => compactAnimationAccessors(source), /shared geometry\/animation/);
});
