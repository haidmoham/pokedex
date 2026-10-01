// Local candidate only. Inputs are individually downloaded, hash-recorded source assets.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const doc=await io.read('data/pikachu-alternative/pikachu.gltf');
console.log(doc.getRoot().listNodes().map(n=>n.getName()).join('\n'));
await io.write('data/pikachu-alternative/original.glb',doc);
await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:90}));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
await io.write('data/pikachu-alternative/candidate.glb',doc);
const files=['pikachu.gltf','pikachu.bin','textures/PikachuDh.png_baseColor.png','textures/PikachuEyeDh.png_baseColor.png','textures/PikachuHohoDh.png_baseColor.png','textures/PikachuMouthDh.png_baseColor.png','original.glb','candidate.glb'];
const identities=[];for(const file of files){const b=await readFile(`data/pikachu-alternative/${file}`);identities.push({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await writeFile('data/pikachu-alternative/identities.json',JSON.stringify(identities,null,2));console.log(identities);
