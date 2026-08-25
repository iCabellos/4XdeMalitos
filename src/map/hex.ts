/**
 * Pointy-top hexagonal grid using axial coordinates (q, r).
 *
 * Layout convention (matches the 3D renderer, camera looking down -Y with
 * -Z towards the top of the screen):
 *   world.x = size * (sqrt(3) * q + sqrt(3) / 2 * r)
 *   world.z = size * (3 / 2 * r)
 */

export interface Axial {
  q: number;
  r: number;
}

export type HexId = string;

/** Stable string key for maps/sets. Keep it cheap: it is used in hot loops. */
export function hexId(q: number, r: number): HexId {
  return `${q},${r}`;
}

export function axialOf(id: HexId): Axial {
  const comma = id.indexOf(',');
  return { q: Number(id.slice(0, comma)), r: Number(id.slice(comma + 1)) };
}

/** Neighbour offsets in clockwise order starting East. */
export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, // E
  { q: 0, r: 1 }, // SE
  { q: -1, r: 1 }, // SW
  { q: -1, r: 0 }, // W
  { q: 0, r: -1 }, // NW
  { q: 1, r: -1 }, // NE
];

export function neighbors(q: number, r: number): Axial[] {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function neighborIds(q: number, r: number): HexId[] {
  return HEX_DIRECTIONS.map((d) => hexId(q + d.q, r + d.r));
}

/** Axial distance == cube distance. */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  // Third cube axis: s = -q - r
  const ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function hexDistanceId(a: HexId, b: HexId): number {
  return hexDistance(axialOf(a), axialOf(b));
}

/** All hexes within `radius` of the centre, inclusive (hex-shaped disc). */
export function hexesInRadius(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

/** Hexagon-shaped map of the given radius centred on (0,0). */
export function hexMapShape(radius: number): Axial[] {
  return hexesInRadius({ q: 0, r: 0 }, radius);
}

export const HEX_SIZE = 1;
const SQRT3 = Math.sqrt(3);

export function hexToWorld(q: number, r: number, size = HEX_SIZE): { x: number; z: number } {
  return {
    x: size * (SQRT3 * q + (SQRT3 / 2) * r),
    z: size * (1.5 * r),
  };
}

/** Inverse of hexToWorld, rounded to the containing hex. */
export function worldToHex(x: number, z: number, size = HEX_SIZE): Axial {
  const r = (2 / 3) * (z / size);
  const q = (SQRT3 / 3) * (x / size) - (1 / 3) * (z / size);
  return roundAxial(q, r);
}

export function roundAxial(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Nearest hex to a point on a circle of `radius` rings at `angle` radians. */
export function hexOnRing(angle: number, ringRadius: number): Axial {
  const world = { x: Math.cos(angle) * ringRadius * SQRT3, z: Math.sin(angle) * ringRadius * 1.5 };
  return worldToHex(world.x, world.z);
}

/** Straight hex line between two hexes (inclusive of both ends). */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ ...a }];
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(roundAxial(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t));
  }
  return out;
}
