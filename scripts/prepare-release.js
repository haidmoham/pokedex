import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
let sha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: models.filter(asset => asset.admitted).length, species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Visual review does not establish rights clearance.',
  modifications:'Optimized derivatives retain at most one recognized idle. Existing derivatives use textures up to 512px. Batch 1 derivatives use reviewed mesh simplification, quantization and 256px WebP textures; some auxiliary PBR maps are removed. Mewtwo uses its separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256, modifications:url.endsWith('-batch1.glb') ? 'Reviewed lossy derivative; mesh simplification and quantization, 256px textures. Pheromosa is rotated to face forward. See coverage-batch-lossy-2026-10-01.json for exact per-asset metrics.' : 'Existing optimized derivative; see project model pipeline reports.'}))
},null,2)+'\n');
