import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const source = (await readFile(new URL('../src/model-policy.ts', import.meta.url), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { admittedModel, fetchModel, validateModelStructure } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const asset = { id: 1, bytes: 500, url: 'https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/1.glb', blobSha: 'a'.repeat(40), admitted: true };
function glb(data = { asset: { version: '2.0' } }) {
  const json = Buffer.from(JSON.stringify(data));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const bytes = Buffer.alloc(20 + padded.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  return bytes;
}
test('model admission is explicit, size-bounded and source-host scoped', () => {
  assert.equal(admittedModel(1, [asset]), asset);
  for (const change of [{ admitted: false }, { bytes: 750001 }, { bytes: 0 }, { url: 'https://elsewhere.test/1.glb' }, { blobSha: 'unknown' }]) assert.equal(admittedModel(1, [{ ...asset, ...change }]), undefined);
  assert.equal(admittedModel(1025, [asset]), undefined);
});
test('changed source identity, oversized streams and malformed GLBs are rejected before viewer allocation', async () => {
  const bytes = glb();
  const checked = { ...asset, bytes: bytes.length, blobSha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
  const load = entry => fetchModel(entry, new AbortController().signal, async () => new Response(bytes));
  assert.equal((await load(checked)).size, bytes.length);
  await assert.rejects(load({ ...checked, blobSha: asset.blobSha }), /identity changed/);
  await assert.rejects(load({ ...checked, bytes: bytes.length - 1 }), /exceeds admission budget/);
  await assert.rejects(load({ ...checked, bytes: bytes.length + 1 }), /source changed/);
  assert.throws(() => validateModelStructure(new ArrayBuffer(3)), /invalid model/);
});
test('compact transfers cannot hide unbounded animation, geometry or external dependencies', () => {
  for (const extra of [{ animations: Array(13).fill({}) }, { textures: Array(9).fill({}) }, { accessors: [{ count: 500001 }] }, { buffers: [{ uri: 'https://elsewhere.test/huge.bin' }] }, { images: [{ uri: 'data:image/png;base64,unbounded' }] }]) {
    const bytes = glb({ asset: { version: '2.0' }, ...extra });
    assert.throws(() => validateModelStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), /budget|dependencies/);
  }
});

test('texture inspection closes every bitmap and rejects oversized decoded memory', async () => {
  const { validateModelTextures } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const jsonBytes = glb({ asset: { version: '2.0' }, images: [{ bufferView: 0, mimeType: 'image/webp' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }] });
  const bytes = Buffer.concat([jsonBytes, Buffer.from([4, 0, 0, 0, 66, 73, 78, 0]), Buffer.alloc(4)]);
  bytes.writeUInt32LE(bytes.length, 8);
  let closed = 0;
  await validateModelTextures(new Blob([bytes]), new AbortController().signal, async () => ({ width: 512, height: 512, close: () => closed++ }));
  await assert.rejects(validateModelTextures(new Blob([bytes]), new AbortController().signal, async () => ({ width: 4096, height: 4096, close: () => closed++ })), /texture exceeds budget/);
  assert.equal(closed, 2);
});
