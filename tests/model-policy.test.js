import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const source = (await readFile(new URL('../src/model-policy.ts', import.meta.url), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { admittedModel, fetchModel, validateModelStructure, rejectedModelPose, previewModelAttribution } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const asset = { id: 1, bytes: 500, url: 'https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/1.glb', blobSha: 'a'.repeat(40), admitted: true };
test('observed broken poses are rejected by exact identity while other static or replacement models remain usable', async () => {
  const rejected = JSON.parse(await readFile(new URL('../content/models/pose-rejections.json', import.meta.url)));
  for (const entry of rejected) {
    const broken = { ...asset, id: entry.id, sha256: entry.sha256 };
    assert.ok(rejectedModelPose(broken));
    assert.equal(admittedModel(entry.id, [broken]), undefined);
    let fetched = false;
    await assert.rejects(fetchModel(broken, new AbortController().signal, async () => { fetched = true; }), /pose rejected/);
    assert.equal(fetched, false);
    const replacement = { ...broken, sha256: 'b'.repeat(64), animation: null };
    assert.equal(rejectedModelPose(replacement), undefined);
    assert.equal(admittedModel(entry.id, [replacement]), replacement);
  }
  assert.equal(admittedModel(35, [{ ...asset, id: 35, animation: null }]).id, 35);
});
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
  assert.equal(admittedModel(1000, [{ ...asset, id: 1000 }]), undefined);
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

test('compressed models cannot declare oversized decoder allocations', () => {
  const validate = data => {
    const bytes = glb({ asset: { version: '2.0' }, ...data });
    return validateModelStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  };
  const meshopt = (count, byteStride) => ({ extensions: { EXT_meshopt_compression: { count, byteStride } } });
  validate({ buffers: [{ byteLength: 1024 }], bufferViews: [meshopt(64, 16)] });
  for (const buffers of [[{ byteLength: 33554433 }], [{ byteLength: 20000000 }, { byteLength: 20000000 }], [{ byteLength: -1 }], [{ byteLength: 1.5 }]]) {
    assert.throws(() => validate({ buffers }), /decoded buffer|geometry exceeds budget/);
  }
  for (const bufferViews of [[meshopt(3000000, 16)], [meshopt(1500000, 16), meshopt(1500000, 16)], [meshopt(-1, 16)], [meshopt(1, 0)], [meshopt(1, 257)]]) {
    assert.throws(() => validate({ bufferViews }), /meshopt allocation|geometry exceeds budget/);
  }
});


test('protected preview credits identify each source family without invented extraction attribution', () => {
  const home = previewModelAttribution(asset);
  assert.match(home.description, /Lilothestitch16/);
  const catalog = previewModelAttribution({ ...asset, preparation: 'catalog-native-idle', source: 'https://github.com/Pokemon-3D-api/assets/blob/pinned/995.glb' });
  assert.match(catalog.description, /original extractor is not identified/);
  assert.match(catalog.description, /rights remain unresolved/);
  assert.doesNotMatch(catalog.description, /Lilothestitch16|rrih/);
  assert.equal(catalog.links[0].url, 'https://github.com/Pokemon-3D-api/assets/blob/pinned/995.glb');
});
