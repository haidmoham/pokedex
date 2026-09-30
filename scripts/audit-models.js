import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'content/models/availability.json'), 'utf8'));
const policy = (await readFile(resolve(root, 'src/model-policy.ts'), 'utf8'))
  .replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
  .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const compiled = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure, MODEL_TRANSFER_LIMIT } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const reportPath = resolve(root, 'data/model-audit.json');
await mkdir(dirname(reportPath), { recursive: true });
const args = process.argv.slice(2);
const all = args.includes('--all');
const limitIndex = args.indexOf('--limit');
const limit = all ? 1025 : limitIndex === -1 ? 24 : Number(args[limitIndex + 1]);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1025) throw new Error('limit must be 1..1025');
// Prefer the ordinary file, then a deterministic variant when no ordinary file exists.
const candidates = [...new Set(manifest.models.map(model => model.id))].sort((a, b) => a - b)
  .map(id => manifest.models.find(model => model.id === id && model.variant === null) ?? manifest.models.find(model => model.id === id));
let previous;
try { previous = JSON.parse(await readFile(reportPath, 'utf8')); } catch { previous = null; }
const results = previous?.treeSha === manifest.treeSha ? previous.results : [];
const pending = candidates.filter(model => !results.some(result => result.id === model.id && result.blobSha === model.blobSha && result.status !== 'source-error')).slice(0, limit);
const started = Date.now();
const SOURCE_CAP = 16 * 1024 * 1024;
const TOTAL_CAP = 350 * 1024 * 1024;
let transferred = 0;

function parseGLB(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('invalid GLB');
  const length = bytes.readUInt32LE(12);
  if (length > bytes.length - 20) throw new Error('invalid GLB JSON');
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
}

async function audit(model) {
  const base = { id: model.id, variant: model.variant, bytes: model.bytes, blobSha: model.blobSha, url: model.url };
  try {
    if (!/^https:\/\/raw\.githubusercontent\.com\/Pokemon-3D-api\/assets\/main\/models\/opt\/regular\/[0-9]+(?:-[FM])?\.glb$/.test(model.url) || model.bytes > SOURCE_CAP) throw new Error('source outside audit bounds');
    const response = await fetch(model.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`source HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        transferred += value.byteLength;
        if (size > Math.min(model.bytes, SOURCE_CAP) || transferred > TOTAL_CAP) throw new Error('source exceeds audit bounds');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    if (size !== model.bytes) throw new Error('source size changed');
    const bytes = Buffer.concat(chunks);
    const hash = createHash('sha1').update(`blob ${size}\0`).update(bytes).digest('hex');
    if (hash !== model.blobSha) throw new Error('source identity changed');
    const gltf = parseGLB(bytes);
    let machineFailure = null;
    try { validateModelStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); } catch (error) { machineFailure = error.message; }
    const extras = gltf.asset?.extras ?? {};
    const provenance = Object.fromEntries(['author', 'license', 'source', 'title'].filter(key => typeof extras[key] === 'string').map(key => [key, extras[key]]));
    const reasons = [];
    if (model.id === 1000) reasons.push('known source visual defects; official-art fallback');
    if (model.bytes > MODEL_TRANSFER_LIMIT) reasons.push('optimization required for 750 KB transfer cap');
    if (machineFailure) reasons.push(machineFailure);
    if (!provenance.author || !provenance.license || !provenance.source) reasons.push('uploader attribution/license/source incomplete');
    reasons.push('underlying Pokemon rights not established', 'browser texture decode and representative visual review pending');
    return { ...base, status: model.id === 1000 ? 'rejected' : machineFailure || model.bytes > MODEL_TRANSFER_LIMIT ? 'optimization-required' : 'machine-candidate', sha256: createHash('sha256').update(bytes).digest('hex'), provenance, reasons,
      meshes: gltf.meshes?.length ?? 0, images: gltf.images?.length ?? 0, animations: (gltf.animations ?? []).map(animation => animation.name ?? null), requiredExtensions: gltf.extensionsRequired ?? [],
      admitted: false, redistributionApproved: false };
  } catch (error) { return { ...base, status: 'source-error', reasons: [error.message], admitted: false, redistributionApproved: false }; }
}

async function save() {
  results.sort((a, b) => a.id - b.id);
  const counts = Object.fromEntries([...new Set(results.map(result => result.status))].map(status => [status, results.filter(result => result.status === status).length]));
  const verifiedSourceBytes = results.filter(result => result.sha256).reduce((total, result) => total + result.bytes, 0);
  await writeFile(`${reportPath}.tmp`, JSON.stringify({ treeSha: manifest.treeSha, auditedAt: new Date().toISOString(), availableSpecies: candidates.length, missingSpecies: manifest.missingSpecies, checked: results.length, counts, verifiedSourceBytes, transferredThisRun: transferred, workers: 2, results }, null, 2) + '\n');
  await rename(`${reportPath}.tmp`, reportPath);
}

for (let offset = 0; offset < pending.length; offset += 2) {
  if (Date.now() - started > 12 * 60 * 1000 || transferred >= TOTAL_CAP) break;
  const batch = await Promise.all(pending.slice(offset, offset + 2).map(audit));
  for (const result of batch) {
    const index = results.findIndex(previous => previous.id === result.id);
    if (index === -1) results.push(result); else results[index] = result;
  }
  await save();
  if ((offset + 2) % 20 === 0 || offset + 2 >= pending.length) console.log(`checked ${results.length}/${candidates.length}; transferred ${transferred} bytes`);
}
await save();
console.log(`report: ${reportPath}; no admission or asset redistribution performed`);
