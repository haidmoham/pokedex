import { createHash } from 'node:crypto';
export function compactGlbViews(bytes) {
    const jsonLength = bytes.readUInt32LE(12), binaryHeader = 20 + jsonLength;
    if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942)
        throw Error('Invalid GLB');
    const model = JSON.parse(bytes.subarray(20, binaryHeader));
    let binary = bytes.subarray(binaryHeader + 8);
    if (bytes.length > 4 * 1024 * 1024)
        throw Error('Source exceeds catalog bound');
    if (model.buffers.length !== 1 || model.buffers[0].uri)
        throw Error('Expected single embedded buffer');
    const refs = [];
    const unpacked = [];
    let newOffset = binary.length;
    for (const a of model.accessors ?? []) {
        if (a.sparse)
            throw Error('Sparse unsupported');
        if (a.bufferView === undefined)
            continue;
        const v = model.bufferViews[a.bufferView];
        if (v.extensions || v.buffer !== 0)
            throw Error('Unsupported view');
        const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
        const size = sizes[a.componentType] * components[a.type];
        if (!size)
            throw Error('Unsupported accessor type');
        if (!Number.isSafeInteger(a.count) || a.count <= 0 || a.count * size > 32 * 1024 * 1024)
            throw Error('Invalid accessor allocation');
        const stride = v.byteStride ?? size;
        if (!Number.isSafeInteger(stride) || stride < size)
            throw Error('Invalid accessor stride');
        const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
        if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(v.byteLength) || v.byteLength < 0 || start + (a.count - 1) * stride + size > (v.byteOffset ?? 0) + v.byteLength)
            throw Error('Invalid accessor range');
        if (newOffset + a.count * size > 32 * 1024 * 1024) throw Error('Catalog preparation exceeds allocation bound');
        const data = Buffer.alloc(a.count * size);
        for (let i = 0; i < a.count; i++) {
            if (start + i * stride + size > binary.length)
                throw Error('Accessor overrun');
            binary.copy(data, i * size, start + i * stride, start + i * stride + size);
        }
        const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
        data.copy(padded);
        const view = { buffer: 0, byteOffset: newOffset, byteLength: data.length };
        if (v.target !== undefined)
            view.target = v.target;
        a.bufferView = model.bufferViews.length;
        a.byteOffset = 0;
        model.bufferViews.push(view);
        newOffset += padded.length;
        unpacked.push(padded);
        refs.push([a, 'bufferView']);
    }
    binary = Buffer.concat([binary, ...unpacked]);
    for (const image of model.images ?? []) {
        if (image.uri || image.bufferView === undefined)
            throw Error('External image unsupported');
        refs.push([image, 'bufferView']);
    }
    for (const mesh of model.meshes ?? [])
        for (const p of mesh.primitives ?? []) {
            const d = p.extensions?.KHR_draco_mesh_compression;
            if (d)
                refs.push([d, 'bufferView']);
        }
    const needed = [...new Set(refs.map(([o, k]) => o[k]))].sort((a, b) => a - b), remap = new Map(), cache = new Map(), views = [], chunks = [];
    let offset = 0;
    for (const old of needed) {
        const view = model.bufferViews[old];
        if (view.buffer !== 0 || view.extensions)
            throw Error('Unsupported compressed/foreign view');
        const start = view.byteOffset ?? 0, end = start + view.byteLength;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > binary.length)
            throw Error('Invalid buffer range');
        const data = binary.subarray(start, end);
        const properties = { ...view };
        delete properties.byteOffset;
        const key = JSON.stringify(properties) + createHash('sha256').update(data).digest('hex');
        if (cache.has(key)) {
            remap.set(old, cache.get(key));
            continue;
        }
        const index = views.length;
        cache.set(key, index);
        remap.set(old, index);
        views.push({ ...view, byteOffset: offset });
        const chunk = Buffer.alloc(Math.ceil(data.length / 4) * 4);
        data.copy(chunk);
        chunks.push(chunk);
        offset += chunk.length;
    }
    for (const [object, key] of refs)
        object[key] = remap.get(object[key]);
    model.bufferViews = views;
    model.buffers[0].byteLength = offset;
    const bin = Buffer.concat(chunks), raw = Buffer.from(JSON.stringify(model)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
    raw.copy(json);
    const result = Buffer.alloc(28 + json.length + bin.length);
    result.writeUInt32LE(0x46546c67, 0);
    result.writeUInt32LE(2, 4);
    result.writeUInt32LE(result.length, 8);
    result.writeUInt32LE(json.length, 12);
    result.writeUInt32LE(0x4e4f534a, 16);
    json.copy(result, 20);
    result.writeUInt32LE(bin.length, 20 + json.length);
    result.writeUInt32LE(0x004e4942, 24 + json.length);
    bin.copy(result, 28 + json.length);
    return result;
}
