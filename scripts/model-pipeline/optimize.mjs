import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetUseTerms } from '../model-candidate-policy.js';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const audit = JSON.parse(await readFile(resolve(root, 'content/models/source-audit.json'), 'utf8'));
const output = resolve(root, 'data/model-optimization');
await mkdir(output, { recursive: true });
const results = [];
// Explicit IDs let a small follow-up repair decoder failures without repeating
// the entire heavy-source experiment or overwriting its report.
const args = process.argv.slice(2);
if (args.length && (![2, 4].includes(args.length) || args[0] !== '--ids' || !/^\d+(,\d+)*$/.test(args[1]) || (args.length === 4 && (args[2] !== '--texture-size' || !['256', '512'].includes(args[3]))))) throw new Error('Usage: optimize.mjs [--ids 855,other-id [--texture-size 256|512]]');
const textureSize = args.length === 4 ? Number(args[3]) : 512;
const suffix = textureSize === 512 ? '' : `-${textureSize}`;
const ids = args.length ? [...new Set(args[1].split(',').map(Number))] : null;
if (ids && (ids.length > 24 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 1025 || !audit.results.some(source => source.id === id && source.status !== 'rejected')))) throw new Error('Choose at most 24 audited, non-rejected species IDs');
const sources = audit.results.filter(source => ids ? ids.includes(source.id) : source.status === 'optimization-required');
const reportPath = resolve(output, ids ? `report-${ids.join('-')}${suffix}.json` : 'report.json');
const pipeline = { geometry: 'exact decoded positions and topology; no simplification or quantization', textures: `WebP quality 90, at most ${textureSize}x${textureSize}`, animation: 'at most one recognized default-wait or idle; no automatic clip inference',
  toolchain: 'scripts/model-pipeline/package-lock.json', perModelTimeoutSeconds: 120, sourceTransferCap: 16 * 1024 * 1024 };
for (const source of sources) {
  const terms = assetUseTerms(source.provenance);
  if (!terms) { results.push({ id: source.id, status: 'terms-unresolved', license: source.provenance.license ?? null }); continue; }
  const base = { id: source.id, assetUseTerms: terms, originalSha256: source.sha256, originalBytes: source.bytes };
  try {
    const input = resolve(output, `${source.id}-source.glb`);
    let cached;
    try { cached = await readFile(input); } catch { cached = null; }
    let bytes = cached && cached.length === source.bytes && createHash('sha256').update(cached).digest('hex') === source.sha256 ? cached : null;
    if (!bytes) {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok || !response.body) throw new Error(`source HTTP ${response.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > source.bytes || size > 16 * 1024 * 1024) throw new Error('source exceeds bounds');
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
      if (size !== source.bytes || createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('source identity changed');
      await writeFile(input, bytes);
    }
    const artifact = resolve(output, `${source.id}-candidate${suffix}.glb`);
    const metrics = resolve(output, `${source.id}-metrics${suffix}.json`);
    await exec(process.execPath, [fileURLToPath(new URL('worker.mjs', import.meta.url)), input, artifact, metrics, String(textureSize)], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(await readFile(metrics, 'utf8'));
    results.push({ ...base, ...result, status: result.machineFailure ? 'budget-rejected' : 'machine-candidate', artifact: `data/model-optimization/${source.id}-candidate${suffix}.glb` });
  } catch (error) { results.push({ ...base, status: 'processing-error', error: (error.stderr || error.message).slice(-800) }); }
  await writeFile(reportPath, JSON.stringify({ workers: 1, sources: sources.length, pipeline, results }, null, 2));
  console.log(`${source.id}: ${results.at(-1).status}; ${results.length}/${sources.length}`);
}
await writeFile(reportPath, JSON.stringify({ workers: 1, sources: sources.length, pipeline, results }, null, 2));
console.log('local derivatives only; no runtime admission or publication');
