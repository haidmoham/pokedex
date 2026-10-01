// Explicit bounded read-only source review. Does not admit or redistribute assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco from 'draco3dgltf';
const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.length > 3 || ids.some(id => !Number.isInteger(id))) throw Error('Provide 1–3 species IDs');
const admitted = JSON.parse(await readFile(new URL('../../content/models/admitted.json', import.meta.url)));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco.createDecoderModule() });
await mkdir('data/idle-review', { recursive: true });
for (const id of ids) {
  const asset = admitted.find(asset => asset.id === id);
  if (!asset) throw Error('Not admitted');
  let bytes;
  if (asset.url.startsWith('/models/')) bytes = await readFile(`public${asset.url}`);
  else {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Source HTTP ${response.status}`);
    const chunks=[]; let size=0;
    for await (const chunk of response.body) { size+=chunk.length; if(size>750000)throw Error('Source exceeds transfer bound');chunks.push(chunk); }
    bytes=Buffer.concat(chunks);
  }
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==asset.bytes || sha256!==asset.sha256)throw Error('Source identity changed');
  const doc=await io.readBinary(bytes);
  const clips=doc.getRoot().listAnimations();
  const clip=clips.find(clip=>/ba10_waitA01\|Base Layer$|defaultwait01_loop$/.test(clip.getName())) ?? (clips.length === 1 ? clips[0] : null);
  if(!clip)throw Error(`No candidate wait clip for ${id}`);
  const joints=new Set(doc.getRoot().listSkins().flatMap(skin=>skin.listJoints()));
  const channels=clip.listChannels();
  const jointChannels=channels.filter(channel=>joints.has(channel.getTargetNode()));
  const moving=jointChannels.filter(channel=>{const a=channel.getSampler().getOutput();const v=a.getArray(), width=a.getElementSize();return v.some((x,i)=>Math.abs(x-v[i%width])>1e-5);});
  const duration=Math.max(...clip.listSamplers().map(s=>Math.max(...s.getInput().getArray())));
  if(moving.length<1 || !Number.isFinite(duration) || duration<=0)throw Error('No real joint motion');
  for(const other of doc.getRoot().listAnimations())if(other!==clip){for(const c of other.listChannels())c.dispose();for(const s of other.listSamplers())s.dispose();other.dispose();}
  for(const extension of doc.getRoot().listExtensionsUsed())if(/meshopt|draco/.test(extension.extensionName))extension.dispose();
  await doc.transform(dequantize());
  await io.write(`data/idle-review/${id}-decoded.glb`,doc);
  const report={id,sha256,bytes:bytes.length,url:asset.url,credit:asset.credit,license:asset.license,source:asset.source,animation:clip.getName(),duration,joints:joints.size,jointChannels:jointChannels.length,movingJointChannels:moving.length,poses:[0.125,0.375,0.625],visualReviewed:false};
  await writeFile(`data/idle-review/${id}.json`,JSON.stringify(report,null,2));console.log(report);
}
