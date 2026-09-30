import { createHash } from 'node:crypto';

export function geometryValuesHash(array, triangleIndices = false) {
  const values = array ? Float64Array.from(array) : new Float64Array();
  // Meshopt cycles triangle indices; allow cycles while preserving winding.
  if (triangleIndices) for (let offset = 0; offset < values.length; offset += 3) {
    const triangle = Array.from(values.subarray(offset, offset + 3));
    const cycles = [triangle, [triangle[1], triangle[2], triangle[0]], [triangle[2], triangle[0], triangle[1]]];
    cycles.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    values.set(cycles[0], offset);
  }
  return createHash('sha256').update(Buffer.from(values.buffer)).digest('hex');
}
