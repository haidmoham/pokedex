// Restore source secondary UVs by replacing entire matched primitives, never
// by assigning UV arrays to Atlas's reordered/quantized optimized vertices.
// This produces a local review derivative only; it does not admit or publish.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const arrayEqual = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);

function animationIdentity(root) {
  return root.listAnimations().map(clip => ({
    name: clip.getName(), extras: clip.getExtras(), channels: clip.listChannels().map(channel => ({
      target: channel.getTargetNode()?.getName(), path: channel.getTargetPath(),
      interpolation: channel.getSampler().getInterpolation(),
      input: Array.from(channel.getSampler().getInput().getArray()),
      output: Array.from(channel.getSampler().getOutput().getArray()),
    })),
  }));
}

function sceneIdentity(root) {
  return {
    nodes: root.listNodes().map(node => ({ name: node.getName(),
      translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
      weights: node.getWeights(), mesh: node.getMesh()?.getName(), skin: skinIdentity(node) })),
    textures: root.listTextures().map(texture => ({ name: texture.getName(), mimeType: texture.getMimeType(),
      imageSha256: sha256(texture.getImage() ?? Buffer.alloc(0)) })),
  };
}

function glbJSON(bytes) {
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
}

function matchingNode(root, meshName) {
  const nodes = root.listNodes().filter(node => node.getMesh()?.getName() === meshName);
  if (nodes.length !== 1) throw new Error(`Ambiguous source mesh node: ${meshName}`);
  return nodes[0];
}

function skinIdentity(node) {
  return {
    joints: node.getSkin()?.listJoints().map(joint => joint.getName()) ?? [],
    inverseBind: Array.from(node.getSkin()?.getInverseBindMatrices()?.getArray() ?? []),
  };
}

function copyAccessor(doc, buffer, source, cache) {
  if (!source) return null;
  if (cache.has(source)) return cache.get(source);
  const array = source.getArray();
  if (!array || array.some(value => !Number.isFinite(value))) throw new Error('Nonfinite original geometry');
  const accessor = doc.createAccessor(source.getName()).setType(source.getType())
    .setArray(array.slice()).setNormalized(source.getNormalized()).setBuffer(buffer);
  cache.set(source, accessor);
  return accessor;
}

/**
 * `materials` are exact live material names from a pinned source-mapping audit.
 * Input byte identities are caller-verified; return hashes bind the derivative.
 * Throws for ambiguous merged materials, absent UVs, or changed skin/rest rigs.
 */
export async function restoreHomeSecondaryUv(atlasBytes, originalGeometryBytes, materials) {
  if (!atlasBytes || !originalGeometryBytes || atlasBytes.byteLength > 8 * 1024 * 1024 ||
    originalGeometryBytes.byteLength > 32 * 1024 * 1024) {
    throw new Error('Bounded HOME source bytes required');
  }
  if (!Array.isArray(materials) || !materials.length || materials.length > 32 ||
    new Set(materials).size !== materials.length || materials.some(name => typeof name !== 'string' || !name)) {
    throw new Error('Exact affected material names required');
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const atlas = await io.readBinary(atlasBytes), original = await io.readBinary(originalGeometryBytes);
  atlas.setLogger(new Logger(Logger.Verbosity.ERROR));
  const root = atlas.getRoot(), sourceRoot = original.getRoot();
  const originalAnimation = animationIdentity(root);
  const originalScene = sceneIdentity(root);
  const atlasJSON = glbJSON(atlasBytes);
  if (originalAnimation.length !== 1 || originalAnimation[0].name !== 'HOME Idle') throw new Error('Native HOME Idle required');
  const sourceMeshes = new Map(sourceRoot.listMeshes().map(mesh => [mesh.getName(), mesh]));
  const buffer = root.listBuffers()[0] ?? atlas.createBuffer();
  const cache = new Map(), replaced = [];
  for (const materialName of materials) {
    const targets = root.listMeshes().flatMap(mesh => mesh.listPrimitives().map((primitive, index) => ({ mesh, index, primitive })))
      .filter(({ primitive }) => primitive.getMaterial()?.getName() === materialName);
    if (!targets.length) throw new Error(`Affected material absent: ${materialName}`);
    for (const { mesh, index, primitive } of targets) {
      const sourceMesh = sourceMeshes.get(mesh.getName());
      const candidates = sourceMesh?.listPrimitives().filter(item => item.getMaterial()?.getName() === materialName) ?? [];
      if (candidates.length !== 1 || targets.filter(target => target.mesh === mesh).length !== 1) {
        throw new Error(`Ambiguous original primitive: ${mesh.getName()} / ${materialName}`);
      }
      const source = candidates[0];
      if (!source.getAttribute('TEXCOORD_1') || source.listTargets().length || primitive.listTargets().length ||
        source.getMode() !== primitive.getMode()) {
        throw new Error(`Original secondary UV unavailable: ${mesh.getName()} / ${materialName}`);
      }
      const oldNode = matchingNode(root, mesh.getName()), rawNode = matchingNode(sourceRoot, mesh.getName());
      if (oldNode.getName() !== rawNode.getName() || !equal(skinIdentity(oldNode), skinIdentity(rawNode)) ||
        !arrayEqual(oldNode.getTranslation(), rawNode.getTranslation()) ||
        !arrayEqual(oldNode.getRotation(), rawNode.getRotation()) ||
        !arrayEqual(oldNode.getScale(), rawNode.getScale())) {
        throw new Error(`Original rig binding changed: ${mesh.getName()}`);
      }
      for (const semantic of primitive.listSemantics()) primitive.setAttribute(semantic, null);
      for (const semantic of source.listSemantics()) primitive.setAttribute(semantic,
        copyAccessor(atlas, buffer, source.getAttribute(semantic), cache));
      primitive.setIndices(copyAccessor(atlas, buffer, source.getIndices(), cache));
      replaced.push({ material: materialName, mesh: mesh.getName(), primitiveIndex: index,
        vertices: source.getAttribute('POSITION').getCount(), uv1: source.getAttribute('TEXCOORD_1').getCount() });
    }
  }
  await atlas.transform(prune({ keepAttributes: true, keepExtras: true }));
  await atlas.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const bytes = Buffer.from(await io.writeBinary(atlas));
  const verified = await io.readBinary(bytes);
  const derivativeJSON = glbJSON(bytes);
  if (!equal(animationIdentity(verified.getRoot()), originalAnimation)) throw new Error('Native HOME Idle changed during UV restoration');
  if (!equal(sceneIdentity(verified.getRoot()), originalScene) ||
    !equal(derivativeJSON.asset, atlasJSON.asset) ||
    !equal(derivativeJSON.nodes, atlasJSON.nodes) ||
    !equal(derivativeJSON.materials, atlasJSON.materials)) {
    throw new Error('Unrelated HOME scene/material/texture values changed during UV restoration');
  }
  for (const item of replaced) {
    const mesh = verified.getRoot().listMeshes().find(candidate => candidate.getName() === item.mesh);
    const primitive = mesh?.listPrimitives()[item.primitiveIndex];
    if (primitive?.getMaterial()?.getName() !== item.material ||
      !primitive.getAttribute('TEXCOORD_1') ||
      primitive.getAttribute('TEXCOORD_1').getCount() !== primitive.getAttribute('POSITION')?.getCount() ||
      primitive.getAttribute('TEXCOORD_1').getArray().some(value => !Number.isFinite(value))) {
      throw new Error(`Secondary UV lost during compression: ${item.mesh} / ${item.material}`);
    }
  }
  return { bytes, metrics: { atlasSha256: sha256(atlasBytes), originalGeometrySha256: sha256(originalGeometryBytes),
    derivativeSha256: sha256(bytes), bytes: bytes.length, transferBudgetPass: bytes.length <= 750000,
    nativeAnimationPreserved: true, unrelatedSceneMaterialTextureValuesPreserved: true,
    primitiveCount: replaced.length, replaced } };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , atlasFile, originalFile, materialsFile, outputFile, metricsFile] = process.argv;
  if (!atlasFile || !originalFile || !materialsFile || !outputFile || !metricsFile) {
    throw new Error('Usage: restore-home-secondary-uv.mjs atlas.glb original-home.glb exact-material-names.json output.glb metrics.json');
  }
  const result = await restoreHomeSecondaryUv(await readFile(atlasFile), await readFile(originalFile),
    JSON.parse(await readFile(materialsFile, 'utf8')));
  await writeFile(outputFile, result.bytes);
  await writeFile(metricsFile, JSON.stringify(result.metrics, null, 2) + '\n');
  console.log(JSON.stringify(result.metrics));
}
