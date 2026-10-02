// Verify the complete locally acquired, pinned original HOME source families.
// Source bytes remain in ignored partial-clone checkouts; only identities and
// a receipt are committed. Safe to rerun after an interrupted sparse checkout.
import { createReadStream } from 'node:fs';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
// The detailed extracted path/hash lists remain ignored local research data.
// The committed per-species core catalog and upstream pointers preserve a
// reproducible recipe without redistributing the complete upstream map.
const companionURL = new URL('data/home-original-companions.json', root);
const identitiesURL = new URL('data/home-selected-file-identities.json', root);
const companions = JSON.parse(await readFile(companionURL, 'utf8'));
const identities = JSON.parse(await readFile(identitiesURL, 'utf8'));
if (companions.speciesCount !== 1025 || identities.filesCount !== 16991 ||
    companions.geometryRevision !== '27703273836f38f0e185976d955b1fbfb15448af' ||
    identities.revision !== '7b18d1a3e22df48329220ea99c4d2a6617d72345') {
  throw new Error('Incomplete or unexpected original HOME source inventory');
}
function checkedPath(path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').some(part => !part || part === '..' || part === '.')) {
    throw new Error('Unsafe source path');
  }
  return path;
}
async function verify(base, source) {
  const path = checkedPath(source.path);
  if (!/^[0-9a-f]{40}$/.test(source.blobSha) || !Number.isSafeInteger(source.bytes) || source.bytes <= 0) {
    throw new Error(`Invalid expected source identity: ${path}`);
  }
  const url = new URL(`data/${base}/${path}`, root);
  const metadata = await stat(url);
  if (!metadata.isFile() || metadata.size !== source.bytes) throw new Error(`Missing or changed source size: ${path}`);
  const sha1 = createHash('sha1').update(`blob ${source.bytes}\0`);
  const sha256 = createHash('sha256');
  for await (const chunk of createReadStream(url)) { sha1.update(chunk); sha256.update(chunk); }
  if (sha1.digest('hex') !== source.blobSha) throw new Error(`Git blob identity changed: ${path}`);
  source.sha256 = sha256.digest('hex');
}

let originalBytes = 0;
for (const entry of companions.sources) {
  await verify('home-geometry-git', entry.geometry);
  originalBytes += entry.geometry.bytes;
}
let companionBytes = 0;
for (const source of identities.files) {
  await verify('home-unity-git', source);
  companionBytes += source.bytes;
}
const byPath = new Map(identities.files.map(source => [source.path, source]));
for (const entry of companions.sources) {
  const native = byPath.get(entry.nativeWait.path);
  if (!native || native.blobSha !== entry.nativeWait.blobSha || native.bytes !== entry.nativeWait.bytes) {
    throw new Error(`Selected original native wait changed: ${entry.id}`);
  }
  entry.nativeWait.sha256 = native.sha256;
}
if (originalBytes !== 349645048 || companionBytes !== 3992352815) throw new Error('Original HOME byte totals changed');
const receipt = { checkedAt: '2026-10-02', sourceStatus: 'acquired-and-verified-in-ignored-local-checkouts',
  originalGeometry: { revision: companions.geometryRevision, species: companions.sources.length, bytes: originalBytes },
  originalCompanions: { revision: identities.revision, files: identities.files.length, bytes: companionBytes,
    materials: companions.materialPaths, textures: companions.texturePaths, animations: companions.animationPaths },
  chosenOriginalNativeWaits: companions.chosenWaits,
  notice: 'No extracted source binaries are committed or publicly released by this receipt. Underlying Pokemon redistribution rights remain unresolved.' };
async function replaceJSON(url, value) {
  const temporary = new URL(`${url.pathname}.tmp`, 'file://');
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, url);
}
await replaceJSON(companionURL, companions);
await replaceJSON(identitiesURL, identities);
await replaceJSON(new URL('content/models/home-source-acquisition-2026-10-02.json', root), receipt);
console.log(JSON.stringify(receipt, null, 2));
