import {createHash} from 'node:crypto';
import {MeshoptEncoder} from 'meshoptimizer';

/** Losslessly compress only native animation bytes; retain original Draco meshes/images. */
export async function compressHomeAnimation(bytes) {
  await MeshoptEncoder.ready;
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
  const jsonLength=bytes.readUInt32LE(12),binaryHeader=20+jsonLength;
  if(bytes.readUInt32LE(16)!==0x4e4f534a||bytes.readUInt32LE(binaryHeader+4)!==0x004e4942)throw Error('Invalid GLB chunks');
  const model=JSON.parse(bytes.subarray(20,binaryHeader)),binary=bytes.subarray(binaryHeader+8);
  if(model.buffers?.length!==1||model.buffers[0].uri)throw Error('Expected one embedded source buffer');
  if(model.animations?.length!==1)throw Error('Expected one native idle');
  const animationAccessors=new Set(),cubicOutputs=new Set();
  for(const sampler of model.animations[0].samplers){
    if(!['LINEAR','STEP','CUBICSPLINE'].includes(sampler.interpolation??'LINEAR'))throw Error('Unsupported interpolation');
    animationAccessors.add(sampler.input);animationAccessors.add(sampler.output);
    if(sampler.interpolation==='CUBICSPLINE')cubicOutputs.add(sampler.output);
  }
  const groups=new Map(),references=[];
  for(let index=0;index<model.accessors.length;index++){
    const accessor=model.accessors[index];
    if(accessor.sparse)throw Error('Sparse source accessor unsupported');
    if(accessor.bufferView===undefined)continue; // Original Draco attribute.
    if(!animationAccessors.has(index)){references.push([accessor,'bufferView']);continue;}
    const elementSize={SCALAR:4,VEC3:12,VEC4:16}[accessor.type];
    const view=model.bufferViews[accessor.bufferView];
    if(accessor.componentType!==5126||!elementSize||view.byteStride||view.extensions||view.buffer!==0)throw Error('Unsupported animation layout');
    const factor=cubicOutputs.has(index)?3:1,stride=elementSize*factor;
    if(!Number.isSafeInteger(accessor.count)||accessor.count<=0||accessor.count%factor)throw Error('Invalid key count');
    const start=(view.byteOffset??0)+(accessor.byteOffset??0),length=accessor.count*elementSize;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length>16*1024*1024||start+length>binary.length||start+length>(view.byteOffset??0)+view.byteLength)throw Error('Invalid animation range');
    const data=binary.subarray(start,start+length);
    if(!groups.has(stride))groups.set(stride,{chunks:[],size:0,accessors:[],duplicates:new Map()});
    const group=groups.get(stride),hash=createHash('sha256').update(data).digest('hex');
    let offset=group.duplicates.get(hash);
    if(offset===undefined){offset=group.size;group.duplicates.set(hash,offset);group.chunks.push(data);group.size+=data.length;}
    group.accessors.push([accessor,offset]);
  }
  for(const image of model.images??[]){if(image.uri||image.bufferView===undefined)throw Error('External image unsupported');references.push([image,'bufferView']);}
  for(const mesh of model.meshes??[])for(const primitive of mesh.primitives){
    const draco=primitive.extensions?.KHR_draco_mesh_compression;
    if(draco)references.push([draco,'bufferView']);
  }
  const needed=[...new Set(references.map(([object,key])=>object[key]))].sort((a,b)=>a-b);
  const views=[],chunks=[],remap=new Map();let byteOffset=0,decodedOffset=0;
  const append=data=>{const start=byteOffset,padded=Buffer.alloc(Math.ceil(data.length/4)*4);data.copy(padded);chunks.push(padded);byteOffset+=padded.length;return start;};
  for(const old of needed){
    const view=model.bufferViews[old],start=view?.byteOffset??0;
    if(!view||view.buffer!==0||view.extensions||!Number.isSafeInteger(view.byteLength)||start<0||start+view.byteLength>binary.length)throw Error('Unsupported non-animation view');
    remap.set(old,views.length);views.push({...view,byteOffset:append(binary.subarray(start,start+view.byteLength))});
  }
  for(const[object,key]of references)object[key]=remap.get(object[key]);
  for(const[stride,group]of groups){
    const data=Buffer.concat(group.chunks);
    // encodeGltfBuffer uses EXT-compatible v0 with no lossy filter. Cubic records
    // group incoming tangent/value/outgoing tangent to improve byte prediction.
    const encoded=Buffer.from(MeshoptEncoder.encodeGltfBuffer(data,data.length/stride,stride,'ATTRIBUTES'));
    const index=views.length;
    views.push({buffer:1,byteOffset:decodedOffset,byteLength:data.length,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:append(encoded),byteLength:encoded.length,byteStride:stride,count:data.length/stride,mode:'ATTRIBUTES',filter:'NONE'}}});
    decodedOffset+=data.length;
    for(const[accessor,offset]of group.accessors){accessor.bufferView=index;accessor.byteOffset=offset;}
  }
  model.bufferViews=views;
  model.buffers=[{byteLength:byteOffset},{byteLength:decodedOffset,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  model.extensionsUsed=[...new Set([...(model.extensionsUsed??[]),'EXT_meshopt_compression'])];
  model.extensionsRequired=[...new Set([...(model.extensionsRequired??[]),'EXT_meshopt_compression'])];
  const raw=Buffer.from(JSON.stringify(model)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
  const data=Buffer.concat(chunks),result=Buffer.alloc(28+json.length+data.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);
  result.writeUInt32LE(data.length,20+json.length);result.writeUInt32LE(0x004e4942,24+json.length);data.copy(result,28+json.length);
  return result;
}
