// Local visual-review input only. This never admits or publishes an asset.
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco from 'draco3dgltf';

const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.length > 3 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 1025) || new Set(ids).size !== ids.length) {
  throw new Error('Provide one to three unique screened species IDs');
}
const directory = new URL('../../data/native-idle-source-screen/', import.meta.url);
await mkdir(directory, { recursive: true });
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco.createDecoderModule(),
});
for (const id of ids) {
  const report = JSON.parse(await readFile(new URL(`${id}.json`, directory), 'utf8'));
  if (report.id !== id || report.status !== 'source-screened-only' || report.admitted !== false || !report.derivative) {
    throw new Error(`Species ${id} has no screened derivative`);
  }
  const source = await readFile(new URL(`${id}-trimmed.glb`, directory));
  if (source.length !== report.derivative.bytes || createHash('sha256').update(source).digest('hex') !== report.derivative.sha256) {
    throw new Error(`Derivative identity changed for ${id}`);
  }
  const document = await io.readBinary(source);
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (/meshopt|draco/.test(extension.extensionName)) extension.dispose();
  }
  await document.transform(dequantize());
  const out = new URL(`${id}-decoded.glb`, directory);
  await io.write(out.pathname, document);
  console.log(JSON.stringify({ id, decoded: out.pathname, sourceSha256: report.derivative.sha256,
    animation: report.derivative.animation, duration: report.derivative.duration }));
}
