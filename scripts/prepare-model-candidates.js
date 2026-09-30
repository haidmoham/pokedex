import { readFile, writeFile } from 'node:fs/promises';
import { proposedAdmission } from './model-candidate-policy.js';
const audit = JSON.parse(await readFile(new URL('../content/models/source-audit.json', import.meta.url), 'utf8'));
const candidates = audit.results.filter(source => source.status === 'machine-candidate').map(source => proposedAdmission(source)).filter(Boolean);
try {
  const optimized = JSON.parse(await readFile(new URL('../content/models/optimization-report.json', import.meta.url), 'utf8'));
  for (const result of optimized.results.filter(result => result.status === 'machine-candidate')) {
    const source = audit.results.find(source => source.id === result.id);
    const candidate = proposedAdmission(source, { bytes: result.bytes, blobSha: '', sha256: result.sha256,
      url: `/models/species-${result.id}-mobile-candidate.glb`, animation: result.animation,
      machineChecked: true, textureDecoded: result.textureDecoded, localArtifact: result.artifact,
      geometryPreserved: result.geometryPreserved });
    if (candidate) candidates.push(candidate);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
candidates.sort((a, b) => a.id - b.id);
await writeFile(new URL('../content/models/candidates.json', import.meta.url), JSON.stringify(candidates, null, 2) + '\n');
console.log(`${candidates.length} source-term-supported proposals; none admitted or bundled into runtime`);
