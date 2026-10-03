export type ModelSize = { x: number; y: number; z: number };
export function framingDistance(size: ModelSize, aspect: number, theta?: number, phi?: number, fov?: number): number;
export function inspectionDistance(size: ModelSize, aspect: number, fov?: number): number;
