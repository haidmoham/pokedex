import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
let sha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: models.filter(asset => asset.admitted).length, species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Representative visual review does not establish universal quality or rights clearance.',
  modifications:'Original geometry retained. Optimized derivatives keep at most one recognized idle and resize textures to at most 512 pixels with WebP quality 90. Mewtwo uses the separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256}))
},null,2)+'\n');
