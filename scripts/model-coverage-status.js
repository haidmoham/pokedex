import { readFile, writeFile } from 'node:fs/promises';
import { assetUseTerms } from './model-candidate-policy.js';
const read = async name => JSON.parse(await readFile(new URL(`../content/models/${name}.json`, import.meta.url), 'utf8'));
const [availability, audit, optimized, followup, batch, admitted, rejected] = await Promise.all([
  read('availability'), read('source-audit'), read('optimization-report'), read('coverage-pass-2026-09-30'), read('coverage-batch-2026-10-01'), read('admitted'), read('pose-rejections'),
]);
const species = Array.from({ length: 1025 }, (_, index) => {
  const id = index + 1;
  const source = audit.results.find(entry => entry.id === id);
  const asset = admitted.find(entry => entry.id === id && entry.admitted);
  const pose = rejected.find(entry => entry.id === id && entry.sha256 === asset?.sha256);
  const candidate = [...batch.results, ...followup.results, ...optimized.results].find(entry => entry.id === id);
  let status;
  if (pose) status = 'pose-rejected';
  else if (asset) status = 'runtime-admitted';
  else if (!source) status = 'source-missing';
  else if (source.status === 'rejected') status = 'source-visual-rejected';
  else if (!assetUseTerms(source.provenance)) status = 'source-terms-unresolved';
  else if (candidate?.status === 'pose-rejected') status = 'candidate-pose-rejected';
  else if (candidate?.status === 'budget-rejected') status = 'optimization-budget-rejected';
  else if (candidate?.status === 'machine-candidate') status = 'optimized-pose-review-pending';
  else status = 'decode-and-pose-review-pending';
  return { id, status, ...(pose ? { reason: pose.reason } : {}) };
});
const buckets = Object.fromEntries([...new Set(species.map(entry => entry.status))].map(status => [status, species.filter(entry => entry.status === status).map(entry => entry.id)]));
const result = { target: 1025, sourceTreeSha: availability.treeSha, available: audit.availableSpecies,
  runtimeAdmitted: buckets['runtime-admitted']?.length ?? 0,
  note: 'Runtime admission is not per-asset pose certification. No full coverage claim. Source terms are embedded uploader evidence; underlying rights remain unknown.',
  counts: Object.fromEntries(Object.entries(buckets).map(([status, ids]) => [status, ids.length])), buckets };
if (process.argv.includes('--write')) await writeFile(new URL('../content/models/coverage-status.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ target: result.target, runtimeAdmitted: result.runtimeAdmitted, counts: result.counts }, null, 2));
