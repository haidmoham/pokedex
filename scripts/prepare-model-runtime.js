import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
// model-viewer loads Meshopt as a classic script. Preserve the official decoder,
// adapting only its ESM export to the documented global decoder interface.
const source = await readFile(new URL('../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js', import.meta.url), 'utf8');
if (!source.includes('export { MeshoptDecoder }')) throw new Error('Meshopt export changed');
await mkdir(new URL('../public/model-runtime/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/model-runtime/meshopt-decoder.js', import.meta.url), source.replace('export { MeshoptDecoder };', 'self.MeshoptDecoder = MeshoptDecoder;'));
await writeFile(new URL('../public/model-runtime/THREE-LICENSE', import.meta.url), await readFile(new URL('../node_modules/three/LICENSE', import.meta.url)));
// A separate stencil-capable Three canvas is required for reviewed HOME
// effects. Keep its Draco decoder local and tied to this locked Three version.
const dracoSource = new URL('../node_modules/three/examples/jsm/libs/draco/gltf/', import.meta.url);
const dracoDestination = new URL('../public/model-runtime/draco/', import.meta.url);
await mkdir(dracoDestination, { recursive: true });
for (const name of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await copyFile(new URL(name, dracoSource), new URL(name, dracoDestination));
}
