// Read-only inventory for the exact approved public release. Source availability,
// reviewed admission, native motion, and redistribution permission stay distinct.
import { readFile } from 'node:fs/promises';
import { verifyPublicModelManifest, PUBLIC_MODEL_RELEASE } from './public-model-release.js';

const root = new URL('../', import.meta.url);
const ordinary = JSON.parse(await readFile(new URL('content/models/admitted.json', root), 'utf8'));
const protectedBytes = await readFile(new URL('content/models/protected-preview.json', root));
verifyPublicModelManifest(protectedBytes);
const extracted = JSON.parse(protectedBytes).assets;

function uniqueBySpecies(assets, label) {
  const bySpecies = new Map();
  const seen = new Set();
  for (const asset of assets) {
    if (!Number.isInteger(asset.id) || asset.id < 1 || asset.id > 1025 || seen.has(asset.id)) {
      throw new Error(`Invalid or duplicate ${label} species`);
    }
    seen.add(asset.id);
    if (asset.admitted === true) bySpecies.set(asset.id, asset);
  }
  return bySpecies;
}

const ordinaryBySpecies = uniqueBySpecies(ordinary, 'ordinary');
const extractedBySpecies = uniqueBySpecies(extracted, 'extracted');
const effective = new Map([...ordinaryBySpecies, ...extractedBySpecies]);
const staticIds = [...effective].filter(([, asset]) => !asset.animation).map(([id]) => id).sort((a, b) => a - b);
const missingIds = Array.from({ length: 1025 }, (_, index) => index + 1).filter(id => !effective.has(id));
const summary = {
  release: PUBLIC_MODEL_RELEASE,
  targetSpecies: 1025,
  ordinaryAdmitted: ordinaryBySpecies.size,
  releasedExtracted: extractedBySpecies.size,
  extractedReplacements: [...extractedBySpecies.keys()].filter(id => ordinaryBySpecies.has(id)).length,
  admittedSpecies: effective.size,
  nativeIdleSpecies: effective.size - staticIds.length,
  staticSpecies: staticIds.length,
  missingSpecies: missingIds.length,
  missingIds,
  staticIds,
};
if (summary.admittedSpecies !== 998 || summary.nativeIdleSpecies !== 547 ||
    summary.staticSpecies !== 451 || summary.missingSpecies !== 27 ||
    summary.releasedExtracted !== 511 || summary.extractedReplacements !== 40) {
  throw new Error('Approved public inventory counts changed');
}
console.log(JSON.stringify(summary, null, 2));
