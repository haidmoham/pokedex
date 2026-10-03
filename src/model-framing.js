// Fit the animated bounds in camera space, preserving source scale/proportions.
// Every corner must satisfy both perspective planes, including its depth.
export function framingDistance(size, aspect, theta = -12, phi = 85, fov = 35) {
  if (![size.x, size.y, size.z, aspect, theta, phi, fov].every(Number.isFinite) ||
      Math.min(size.x, size.y, size.z) < 0 || Math.max(size.x, size.y, size.z) <= 0 || aspect <= 0 || fov <= 0 || fov >= 180) {
    throw Error('Invalid model framing bounds');
  }
  const rad = Math.PI / 180, t = theta * rad, p = phi * rad;
  const vertical = Math.tan(fov * rad / 2) * 0.88;
  const horizontal = vertical * aspect;
  let distance = 0;
  for (const x of [-size.x / 2, size.x / 2]) for (const y of [-size.y / 2, size.y / 2]) for (const z of [-size.z / 2, size.z / 2]) {
    const right = x * Math.cos(t) - z * Math.sin(t);
    const up = -x * Math.cos(p) * Math.sin(t) + y * Math.sin(p) - z * Math.cos(p) * Math.cos(t);
    const depth = x * Math.sin(p) * Math.sin(t) + y * Math.cos(p) + z * Math.sin(p) * Math.cos(t);
    distance = Math.max(distance, depth + Math.max(Math.abs(right) / horizontal, Math.abs(up) / vertical));
  }
  return Math.max(distance, 1e-4);
}

// A sphere fits at every inspection angle, so tails/wings cannot clip while orbiting.
export function inspectionDistance(size, aspect, fov = 35) {
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  const halfVertical = fov * Math.PI / 360;
  return radius / Math.sin(Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * aspect))) / 0.88;
}
