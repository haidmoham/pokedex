// Fetch pinned official-art references for the 478 CPU pose reviews. This is
// local visual QA input, not a source-license claim or site gallery change.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const directory = new URL('data/atlas-review/', root);
await mkdir(directory, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('content/models/atlas-source-catalog-2026-10-02.json', root), 'utf8'));
const candidates = catalog.records.filter(item => item.currentPublicRuntime !== 'native-idle');
if (candidates.length !== 478) throw Error('Current native-idle gap changed');
const revision = 'bfb75391935310368065096fa08c51e8970bc43e';
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const results = []; let cursor = 0;
async function worker() {
  while (cursor < candidates.length) {
    const id = candidates[cursor++].id;
    const path = new URL(`${id}-official.png`, directory);
    const url = `https://raw.githubusercontent.com/PokeAPI/sprites/${revision}/sprites/pokemon/other/official-artwork/${id}.png`;
    let bytes = null, error = null;
    try {
      bytes = await readFile(path);
      if (!bytes.subarray(0, 8).equals(pngSignature)) bytes = null;
    } catch { /* Fetch absent reference. */ }
    if (!bytes) {
      try {
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!response.ok || !response.body) throw Error(`HTTP ${response.status}`);
        let size = 0; const chunks = [];
        for await (const chunk of response.body) { size += chunk.length; if (size > 5 * 1024 * 1024) throw Error('PNG cap'); chunks.push(chunk); }
        bytes = Buffer.concat(chunks);
        if (!bytes.subarray(0, 8).equals(pngSignature)) throw Error('Invalid PNG');
        await writeFile(path, bytes);
      } catch (failure) { error = String(failure.message); }
    }
    results.push({ id, status: bytes ? 'reference-fetched' : 'reference-failed', url,
      path: bytes ? path.pathname : null, bytes: bytes?.length ?? null,
      sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null, error });
    if (results.length % 50 === 0 || results.length === candidates.length) console.log(`Official art ${results.length}/${candidates.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
results.sort((a, b) => a.id - b.id);
const output = { checkedAt: '2026-10-02', repository: 'PokeAPI/sprites', revision,
  scope: 'Pinned official-art visual references only; no imported site artwork or individual artist claim',
  target: 478, fetched: results.filter(result => result.status === 'reference-fetched').length,
  failed: results.filter(result => result.status === 'reference-failed').length, results };
await writeFile(new URL('data/atlas-review/official-art-references.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ target: output.target, fetched: output.fetched, failed: output.failed }));
if (output.failed) process.exitCode = 1;
