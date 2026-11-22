// Approved guide walls, measured in world metres from the user's creation-mode drawing.
export const ENTRANCE_LIMITS = [
  { a: [-66.75, 23.5], b: [16.75, 23.5] },
  { a: [16.75, 23.5], b: [16.75, 28.25] },
  { a: [25.5, 28.25], b: [25.5, 23.75] },
  { a: [25.5, 23.75], b: [33.75, 23.75] },
  { a: [33.75, 23.75], b: [33.75, -21.5] },
];
export const ENTRANCE_RETURNS = [
  { a: [33.75, -21.5], b: [12, -21.5] },
  { a: [12, -21.5], b: [12, -8] },
  { a: [-66.75, 23.5], b: [-66.75, 18.9] },
];
export const ACCESS = {
  gateX: [16.75, 25.5], gateZ: 28.25, width: 6,
  centerX: 21.125, turnX: 13.125, turnZ: 21.9, radius: 8,
  terminalWidth: 7.6, oldRoadEnd: 12, taperEnd: 26.5, endZ: 64,
  wallHeight: 3.3, wallThickness: .44,
};
export function accessArc(radius, reverse = false, steps = 36) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = -Math.PI / 2 + (reverse ? steps - i : i) / steps * Math.PI / 2;
    return [ACCESS.turnX + radius * Math.cos(angle), ACCESS.turnZ + radius * Math.sin(angle)];
  });
}
export function accessRoadPolygons() {
  const A = ACCESS, inner = A.radius - A.terminalWidth / 2, outer = A.radius + A.terminalWidth / 2;
  return [
    [[A.oldRoadEnd, 10.1], [A.turnX, 10.1], [A.turnX, 17.7], [A.oldRoadEnd, 17.7]],
    [...accessArc(outer), ...accessArc(inner, true)],
    [[A.turnX + inner, A.turnZ], [A.turnX + outer, A.turnZ],
      [A.centerX + A.width / 2, A.taperEnd], [A.centerX + A.width / 2, A.endZ],
      [A.centerX - A.width / 2, A.endZ], [A.centerX - A.width / 2, A.taperEnd]],
  ];
}
export function accessPavingPolygons() {
  const A = ACCESS;
  return [
    [[12, 17.7], ...accessArc(A.radius - A.terminalWidth / 2), [18.125, A.taperEnd],
      [18.125, A.gateZ], [16.98, A.gateZ], [16.98, 23.29], [12, 23.29]],
    [[12, 7.6], [33.52, 7.6], [33.52, 23.52], [25.73, 23.52], [25.73, A.gateZ],
      [24.125, A.gateZ], [24.125, A.taperEnd], ...accessArc(A.radius + A.terminalWidth / 2, true), [12, 10.1]],
    [[16.98, A.gateZ], [18.125, A.gateZ], [18.125, A.endZ], [15.925, A.endZ], [15.925, 31.5]],
    [[24.125, A.gateZ], [25.73, A.gateZ], [26.325, 31.5], [26.325, A.endZ], [24.125, A.endZ]],
  ];
}
