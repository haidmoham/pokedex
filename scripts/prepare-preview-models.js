import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isProtectedModelPreview} from './preview-model-context.js';
import {trimHomeIdle} from './trim-home-idle.js';
import {compressHomeAnimation} from './compress-home-animation.js';
import {selectCatalogIdle,reviewedCatalogSource} from './select-catalog-idle.js';
const directory=new URL('../public/models/',import.meta.url),generated=new URL('../.generated/',import.meta.url);
await mkdir(directory,{recursive:true});await mkdir(generated,{recursive:true});
// Only remove this build step's generated assets, including after a preview build.
for(const name of await readdir(directory))if(/^home-preview-\d+\.glb$/.test(name))await unlink(new URL(name,directory));
let assets=[];
if(isProtectedModelPreview()){
 const manifest=JSON.parse(await readFile(new URL('../content/models/protected-preview.json',import.meta.url)));
 assets=manifest.assets;
 if(!Array.isArray(assets)||assets.length>1025)throw Error('Invalid preview inventory');
 let cursor=0,transferred=0;
 await Promise.all([0,1].map(async()=>{while(cursor<assets.length){
  const asset=assets[cursor++],source=asset.sourceArtifact;
  if(!asset.previewOnly||asset.rightsStatus!=='unresolved'||asset.poseReview?.status!=='approved-for-protected-preview'||asset.poseReview.sha256!==asset.sha256)throw Error('Preview review missing');
  const catalog=asset.preparation==='catalog-native-idle'?reviewedCatalogSource(asset):null;
  if(asset.preparation!==undefined&&!catalog)throw Error('Unknown preview preparation');
  if(!catalog&&!/^https:\/\/raw\.githubusercontent\.com\/rrih\/rrih\.github\.io\/ef25889c60f099aa864bed11042f4054827a78c4\/atlas\/public\/models\/home\/\d+\.glb$/.test(source.url))throw Error('Unpinned preview source');
  const response=await fetch(source.url,{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok||!response.body)throw Error(`Preview source HTTP ${response.status}`);
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;transferred+=chunk.length;if(size>source.bytes||size>(catalog?catalog.bytes:1500000)||transferred>250*1024*1024)throw Error('Preview acquisition cap');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(size!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Preview source changed');
  if(asset.materialRepair!==undefined&&asset.materialRepair!=='zero-additive-to-transparent')throw Error('Unknown preview material repair');
  const result=catalog?selectCatalogIdle(bytes,catalog.animation):trimHomeIdle(bytes,{normalizeZeroAdditive:asset.materialRepair==='zero-additive-to-transparent'});if(asset.compressionRepair!==undefined&&asset.compressionRepair!=='lossless-animation-meshopt')throw Error('Unknown animation compression');
  if(asset.compressionRepair==='lossless-animation-meshopt')result.bytes=await compressHomeAnimation(result.bytes);
  if(result.bytes.length!==asset.bytes||asset.bytes>750000||createHash('sha256').update(result.bytes).digest('hex')!==asset.sha256)throw Error('Preview derivative changed');
  if(asset.url!==`/models/home-preview-${asset.id}.glb`)throw Error('Invalid preview destination');
  await writeFile(new URL(`home-preview-${asset.id}.glb`,directory),result.bytes);
 }}));
}
await writeFile(new URL('preview-models.json',generated),JSON.stringify(assets)+'\n');
console.log(`${assets.length} protected-preview models prepared; production admission unchanged`);
