// Plan coordinates in metres. Snap tolerance is supplied in screen pixels by the UI.
export function closestOnWall(point, wall) {
  const dx = wall.b[0] - wall.a[0], dz = wall.b[1] - wall.a[1];
  const length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - wall.a[0]) * dx + (point.z - wall.a[1]) * dz) / length2)) : 0;
  return { x: wall.a[0] + t * dx, z: wall.a[1] + t * dz };
}

export function snapWallPoint(point, { walls = [], start = null, direction = null, tolerance = .3, free = false } = {}) {
  if (free) return { ...point, snapped: false };
  let target = { x: Math.round(point.x * 4) / 4, z: Math.round(point.z * 4) / 4 };
  let axis = null;
  if (start) {
    const d = direction || { x: 1, z: 0 }, size = Math.hypot(d.x, d.z) || 1;
    const u = { x: d.x / size, z: d.z / size }, v = { x: -u.z, z: u.x };
    const delta = { x: point.x - start.x, z: point.z - start.z };
    axis = Math.abs(delta.x * u.x + delta.z * u.z) >= Math.abs(delta.x * v.x + delta.z * v.z) ? u : v;
    const distance = Math.round((delta.x * axis.x + delta.z * axis.z) * 4) / 4;
    target = { x: start.x + distance * axis.x, z: start.z + distance * axis.z };
  }
  const dist = p => Math.hypot(p.x - point.x, p.z - point.z);
  const onAxis = p => !axis || Math.abs((p.x - start.x) * axis.z - (p.z - start.z) * axis.x) < 1e-6;
  // Endpoints take priority; a projected join must retain the perpendicular constraint.
  let best = null, bestDistance = tolerance;
  for (const wall of walls) for (const [x, z] of [wall.a, wall.b]) {
    const candidate = { x, z }, distance = dist(candidate);
    if (onAxis(candidate) && distance <= bestDistance) { best = candidate; bestDistance = distance; }
  }
  if (best) return { ...best, snapped: true };
  for (const wall of walls) {
    let candidate;
    if (!axis) candidate = closestOnWall(point, wall);
    else {
      const dx = wall.b[0] - wall.a[0], dz = wall.b[1] - wall.a[1];
      const cross = axis.x * dz - axis.z * dx;
      if (Math.abs(cross) < 1e-8) candidate = closestOnWall(target, wall);
      else {
        const ax = wall.a[0] - start.x, az = wall.a[1] - start.z;
        const t = (ax * axis.z - az * axis.x) / cross;
        if (t < 0 || t > 1) continue;
        candidate = { x: wall.a[0] + t * dx, z: wall.a[1] + t * dz };
      }
    }
    const distance = dist(candidate);
    if (onAxis(candidate) && distance <= bestDistance) { best = candidate; bestDistance = distance; }
  }
  return { ...(best || target), snapped: !!best };
}

export function validWall(a, b) {
  return [a?.x, a?.z, b?.x, b?.z].every(Number.isFinite) && Math.hypot(b.x - a.x, b.z - a.z) >= .25;
}
