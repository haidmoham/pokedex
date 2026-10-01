import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import ts from 'typescript';
import { selectCatalogIdle } from '../select-catalog-idle.js';
const root = process.argv[2];
if (!root) throw Error('Provide the local source-review directory');
const policy = (await readFile('src/model-policy.ts', 'utf8')).replace("import admission from '../content/models/admitted.json';", 'const admission=[];').replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
const js = ts.transpileModule(policy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateModelStructure, validateModelTextures } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
const rows = [];
for (const item of JSON.parse(await readFile(`${root}/catalog-native-idles/inspection.json`))) {
    const original = await readFile(`${root}/catalog-repair-samples/${item.id}.glb`);
    assert.equal(original.length, item.bytes);
    assert.equal(createHash('sha256').update(original).digest('hex'), item.sha256);
    const prepared = selectCatalogIdle(original, item.clips[0].name).bytes;
    assert.ok(prepared.length <= 750000);
    validateModelStructure(prepared.buffer.slice(prepared.byteOffset, prepared.byteOffset + prepared.length));
    await validateModelTextures(new Blob([prepared]), new AbortController().signal, async (blob) => { const { info } = await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, close() { } }; });
    const before = await io.readBinary(original), after = await io.readBinary(prepared), a = before.getRoot(), b = after.getRoot();
    const clip = a.listAnimations().find(x => x.getName() === item.clips[0].name), result = b.listAnimations()[0];
    assert.equal(b.listAnimations().length, 1);
    assert.equal(result.getName(), clip.getName());
    assert.equal(result.listChannels().length, clip.listChannels().length);
    let animationBytes = 0, geometryBytes = 0;
    for (let i = 0; i < clip.listChannels().length; i++) {
        const x = clip.listChannels()[i], y = result.listChannels()[i];
        assert.equal(y.getTargetPath(), x.getTargetPath());
        assert.equal(y.getTargetNode().getName(), x.getTargetNode().getName());
        assert.equal(y.getSampler().getInterpolation(), x.getSampler().getInterpolation());
        for (const getter of ['getInput', 'getOutput']) {
            const av = x.getSampler()[getter]().getArray(), bv = y.getSampler()[getter]().getArray();
            assert.deepEqual(bv, av);
            animationBytes += av.byteLength;
        }
    }
    assert.equal(a.listMeshes().length, b.listMeshes().length);
    for (let i = 0; i < a.listMeshes().length; i++) {
        const x = a.listMeshes()[i].listPrimitives(), y = b.listMeshes()[i].listPrimitives();
        assert.equal(x.length, y.length);
        for (let k = 0; k < x.length; k++) {
            assert.deepEqual(x[k].listSemantics(), y[k].listSemantics());
            for (const semantic of x[k].listSemantics()) {
                const av = x[k].getAttribute(semantic).getArray(), bv = y[k].getAttribute(semantic).getArray();
                assert.deepEqual(av, bv);
                geometryBytes += av.byteLength;
            }
            assert.deepEqual(x[k].getIndices()?.getArray(), y[k].getIndices()?.getArray());
            assert.equal(x[k].listTargets().length, y[k].listTargets().length);
        }
    }
    assert.equal(a.listTextures().length, b.listTextures().length);
    for (let i = 0; i < a.listTextures().length; i++)
        assert.deepEqual(a.listTextures()[i].getImage(), b.listTextures()[i].getImage());
    assert.equal(a.listNodes().length, b.listNodes().length);
    for (let i = 0; i < a.listNodes().length; i++) {
        const x = a.listNodes()[i], y = b.listNodes()[i];
        for (const getter of ['getName', 'getTranslation', 'getRotation', 'getScale', 'getWeights'])
            assert.deepEqual(x[getter](), y[getter]());
    }
    for (let i = 0; i < a.listSkins().length; i++) {
        const x = a.listSkins()[i], y = b.listSkins()[i];
        assert.deepEqual(x.getInverseBindMatrices()?.getArray(), y.getInverseBindMatrices()?.getArray());
        assert.deepEqual(x.listJoints().map(n => n.getName()), y.listJoints().map(n => n.getName()));
    }
    rows.push({ id: item.id, sourceSha256: item.sha256, sha256: createHash('sha256').update(prepared).digest('hex'), bytes: prepared.length, structureBudget: 'pass', textureBudget: 'pass', animation: result.getName(), channels: result.listChannels().length, animationBytes, geometryBytes, animationByteDifferences: 0, geometryByteDifferences: 0, texturesUnchanged: true, restTransformsUnchanged: true, skinBindingsUnchanged: true });
}
await writeFile(`${root}/catalog-native-idles/verification.json`, JSON.stringify(rows, null, 2));
console.log(rows);
