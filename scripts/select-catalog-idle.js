import { compactGlbViews } from './compact-catalog-views.js';
export function selectCatalogIdle(bytes, animationName) {
    if (bytes.length < 28 || bytes.length > 4 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(12) > bytes.length - 28)
        throw Error('Invalid bounded catalog GLB');
    const end = 20 + bytes.readUInt32LE(12);
    if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(end + 4) !== 0x004e4942 || bytes.readUInt32LE(end) !== bytes.length - end - 8) throw Error('Invalid catalog chunks');
    const model = JSON.parse(bytes.subarray(20, end)), binary = bytes.subarray(end + 8);
    if (!/^pm\d{4}_00_00_00000_defaultwait01_loop$/.test(animationName))
        throw Error('Invalid native idle name');
    const selected = (model.animations ?? []).filter(a => a.name === animationName);
    if (selected.length !== 1)
        throw Error('Ambiguous native idle');
    model.animations = selected;
    const used = new Set();
    for (const mesh of model.meshes ?? [])
        for (const p of mesh.primitives) {
            Object.values(p.attributes).forEach(i => used.add(i));
            if (p.indices !== undefined)
                used.add(p.indices);
            for (const target of p.targets ?? [])
                Object.values(target).forEach(i => used.add(i));
        }
    for (const skin of model.skins ?? [])
        if (skin.inverseBindMatrices !== undefined)
            used.add(skin.inverseBindMatrices);
    for (const a of model.animations)
        for (const s of a.samplers) {
            used.add(s.input);
            used.add(s.output);
        }
    const indices = [...used].sort((a, b) => a - b), remap = new Map(indices.map((old, i) => [old, i]));
    for (const mesh of model.meshes ?? [])
        for (const p of mesh.primitives) {
            for (const k of Object.keys(p.attributes))
                p.attributes[k] = remap.get(p.attributes[k]);
            if (p.indices !== undefined)
                p.indices = remap.get(p.indices);
            for (const target of p.targets ?? [])
                for (const k of Object.keys(target))
                    target[k] = remap.get(target[k]);
        }
    for (const skin of model.skins ?? [])
        if (skin.inverseBindMatrices !== undefined)
            skin.inverseBindMatrices = remap.get(skin.inverseBindMatrices);
    for (const a of model.animations)
        for (const s of a.samplers) {
            s.input = remap.get(s.input);
            s.output = remap.get(s.output);
        }
    model.accessors = indices.map(i => model.accessors[i]);
    const raw = Buffer.from(JSON.stringify(model)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
    raw.copy(json);
    const b = Buffer.alloc(28 + json.length + binary.length);
    b.writeUInt32LE(0x46546c67, 0);
    b.writeUInt32LE(2, 4);
    b.writeUInt32LE(b.length, 8);
    b.writeUInt32LE(json.length, 12);
    b.writeUInt32LE(0x4e4f534a, 16);
    json.copy(b, 20);
    b.writeUInt32LE(binary.length, 20 + json.length);
    b.writeUInt32LE(0x004e4942, 24 + json.length);
    binary.copy(b, 28 + json.length);
    const output = compactGlbViews(b);
    return { bytes: output, animation: animationName };
}
// Only the two independently reviewed immutable source files qualify for this path.
const catalogSources = {
    995: { bytes: 2914604, sha256: '0732b261a555c62bbdedcd77374f64e6fad4ce4d6a14ce1ab05ef2c5e61791ef', animation: 'pm1095_00_00_00000_defaultwait01_loop' },
    1023: { bytes: 3163984, sha256: 'fcad43d2cb051dadac3fe489155950530922ceb05384842cf3558a100694b9e9', animation: 'pm1128_00_00_00000_defaultwait01_loop' },
};
export function reviewedCatalogSource(asset) {
    const known = catalogSources[asset.id];
    const url = `https://raw.githubusercontent.com/Pokemon-3D-api/assets/429de1288cea0d43f5b4f56305d2276e94239d65/models/opt/regular/${asset.id}.glb`;
    if (!known || asset.preparation !== 'catalog-native-idle' || asset.sourceArtifact?.url !== url ||
        asset.sourceArtifact?.bytes !== known.bytes || asset.sourceArtifact?.sha256 !== known.sha256 ||
        asset.animation !== known.animation || asset.materialRepair !== undefined || asset.compressionRepair !== undefined) {
        throw Error('Unreviewed catalog source');
    }
    return known;
}
