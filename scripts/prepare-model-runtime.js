import { readFile, mkdir, writeFile } from 'node:fs/promises';
// model-viewer loads Meshopt as a classic script. Preserve the official decoder,
// adapting only its ESM export to the documented global decoder interface.
const source = await readFile(new URL('../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js', import.meta.url), 'utf8');
if (!source.includes('export { MeshoptDecoder }')) throw new Error('Meshopt export changed');
await mkdir(new URL('../public/model-runtime/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/model-runtime/meshopt-decoder.js', import.meta.url), source.replace('export { MeshoptDecoder };', 'self.MeshoptDecoder = MeshoptDecoder;'));
await writeFile(new URL('../public/model-runtime/THREE-LICENSE', import.meta.url), await readFile(new URL('../node_modules/three/LICENSE', import.meta.url)));
