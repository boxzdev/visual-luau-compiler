import { TreeNodeData } from '../types';
import { getWorldDefaultPosition, getWorldDefaultSize } from '../data';

export interface RigidBodyState {
  id: string;
  velocity: [number, number, number];
  angularVelocity: [number, number, number]; // radians/sec, world space
  lastPos: [number, number, number];
  asleep: boolean;
  sleepTimer: number;
  // Sleep bookkeeping. When a body falls asleep we remember what it was resting
  // on (restContacts). On the next step we snapshot the transforms of itself and
  // those partners (restSig). If any of them change while the body sleeps (a
  // script moves/deletes the floor, CanCollide is toggled, ...) the body is
  // woken, so it can never hang in mid-air on a support that's gone.
  restContacts?: string[];
  restSig?: number[] | null;
  lastSeen?: number; // step counter; used to garbage-collect bodies of deleted parts
}

type Vec3 = [number, number, number];
// 3x3 matrix as [row][col].
type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------
function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function v3scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function v3dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function v3cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function v3len(a: Vec3): number {
  return Math.sqrt(v3dot(a, a));
}
function v3norm(a: Vec3): Vec3 {
  const l = v3len(a);
  return l > 1e-9 ? v3scale(a, 1 / l) : [0, 0, 0];
}

// ---------------------------------------------------------------------------
// Rotation matrices
//
// Built as R = Rx(rx) * Ry(ry) * Rz(rz), which is the exact convention
// luaRunner.ts's extractCFrameData already assumes when it decomposes a
// CFrame's rotation matrix back into [rx, ry, rz] (verified: building a
// matrix this way and decomposing it with those formulas round-trips
// exactly). Keeping the physics engine's internal rotation math in that same
// convention means a part's `rotation` field always means the same thing
// everywhere in the app — set by a script, dragged with a gizmo, or now,
// driven by angular velocity.
// ---------------------------------------------------------------------------
function matMul(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i][k] * b[k][j];
      r[i][j] = s;
    }
  }
  return r;
}

function rotMatFromEuler(rx: number, ry: number, rz: number): Mat3 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx: Mat3 = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const Ry: Mat3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const Rz: Mat3 = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  return matMul(matMul(Rx, Ry), Rz);
}


// Inverse of rotMatFromEuler — mirrors extractCFrameData's decomposition in
// luaRunner.ts exactly, so it stays in sync with how CFrames get decomposed
// elsewhere in the app.
function eulerFromRotMat(m: Mat3): Vec3 {
  const r00 = m[0][0], r01 = m[0][1], r02 = m[0][2];
  const r11 = m[1][1], r12 = m[1][2];
  const r21 = m[2][1], r22 = m[2][2];
  // |cos(ry)| computed from the other two entries of the column. This is far
  // better conditioned near +-90deg than asin(r02) alone (asin has an infinite
  // slope at +-1, so tiny rounding errors became large angle errors).
  const cosY = Math.hypot(r12, r22);
  const ry = Math.atan2(Math.max(-1, Math.min(1, r02)), cosY);
  let rx: number, rz: number;
  if (cosY > 1e-6) {
    rx = Math.atan2(-r12, r22);
    rz = Math.atan2(-r01, r00);
  } else {
    // Gimbal lock — same fallback used everywhere else in the app.
    rx = Math.atan2(r21, r11);
    rz = 0;
  }
  return [rx, ry, rz];
}

interface Axes {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

function axesFromMat(m: Mat3): Axes {
  return {
    x: [m[0][0], m[1][0], m[2][0]],
    y: [m[0][1], m[1][1], m[2][1]],
    z: [m[0][2], m[1][2], m[2][2]],
  };
}

function orthonormalize(m: Mat3): Mat3 {
  // Gram-Schmidt re-orthonormalization — corrects the tiny drift introduced
  // by integrating the rotation matrix incrementally frame to frame (see
  // integrateOrientation below) so it doesn't slowly stop being a valid
  // rotation.
  let x: Vec3 = [m[0][0], m[1][0], m[2][0]];
  let y: Vec3 = [m[0][1], m[1][1], m[2][1]];
  x = v3norm(x);
  y = v3sub(y, v3scale(x, v3dot(x, y)));
  y = v3norm(y);
  const z = v3cross(x, y);
  return [
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]],
  ];
}

function matFromAxes(a: Axes): Mat3 {
  return [
    [a.x[0], a.y[0], a.z[0]],
    [a.x[1], a.y[1], a.z[1]],
    [a.x[2], a.y[2], a.z[2]],
  ];
}

// Rotates the orientation matrix about the world-space axis `w` by |w| * dt
// radians (w * dt is the rotation vector). Uses Rodrigues' rotation formula, so
// the rotation is exact for any size of step. The old version added
// (w x column) * dt to each column, which turns the matrix by atan(|w|dt)
// instead of |w|dt — spins came out noticeably slower than the angular
// velocity that was set, and the error grew with spin speed.
function integrateOrientation(m: Mat3, w: Vec3, dt: number): Mat3 {
  const wl = v3len(w);
  const theta = wl * dt;
  if (theta < 1e-9) return m;
  const k = v3scale(w, 1 / wl);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const oc = 1 - c;
  const rot = (v: Vec3): Vec3 => {
    const kxv = v3cross(k, v);
    const kdv = v3dot(k, v) * oc;
    return [v[0] * c + kxv[0] * s + k[0] * kdv, v[1] * c + kxv[1] * s + k[1] * kdv, v[2] * c + kxv[2] * s + k[2] * kdv];
  };
  const x = rot([m[0][0], m[1][0], m[2][0]]);
  const y = rot([m[0][1], m[1][1], m[2][1]]);
  const z = rot([m[0][2], m[1][2], m[2][2]]);
  // Still re-orthonormalize: cheap insurance against drift over thousands of frames.
  return orthonormalize([
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]],
  ]);
}


// ---------------------------------------------------------------------------
// Materials
//
// Approximate values in the spirit of Roblox's real PhysicalProperties
// defaults per-material (Roblox doesn't publish exact constants for every
// material, and Studio lets creators override them per-part anyway), tuned
// so relative behavior feels right: ice is slick, wood/concrete are grippy,
// metal is heavy, rubber-like materials bounce more, etc.
// ---------------------------------------------------------------------------
export interface MaterialPhysicalProperties {
  density: number;
  friction: number;
  elasticity: number;
}

const MATERIAL_PROPERTIES: Record<string, MaterialPhysicalProperties> = {
  Plastic: { density: 0.7, friction: 0.3, elasticity: 0.5 },
  SmoothPlastic: { density: 0.7, friction: 0.2, elasticity: 0.5 },
  Neon: { density: 0.7, friction: 0.3, elasticity: 0.5 },
  ForceField: { density: 0.7, friction: 0.3, elasticity: 0.5 },
  Glass: { density: 2.5, friction: 0.25, elasticity: 0.5 },
  Ice: { density: 0.9, friction: 0.02, elasticity: 0.15 },
  Wood: { density: 0.35, friction: 0.48, elasticity: 0.2 },
  WoodPlanks: { density: 0.35, friction: 0.48, elasticity: 0.2 },
  Metal: { density: 7.85, friction: 0.35, elasticity: 0.25 },
  CorrodedMetal: { density: 7.85, friction: 0.5, elasticity: 0.2 },
  DiamondPlate: { density: 7.85, friction: 0.35, elasticity: 0.25 },
  Foil: { density: 2.7, friction: 0.4, elasticity: 0.2 },
  Concrete: { density: 2.4, friction: 0.72, elasticity: 0.17 },
  Brick: { density: 2.4, friction: 0.6, elasticity: 0.17 },
  Granite: { density: 2.7, friction: 0.4, elasticity: 0.2 },
  Marble: { density: 2.56, friction: 0.3, elasticity: 0.2 },
  Slate: { density: 2.69, friction: 0.4, elasticity: 0.2 },
  Basalt: { density: 3.0, friction: 0.7, elasticity: 0.15 },
  Cobblestone: { density: 2.7, friction: 0.65, elasticity: 0.15 },
  Grass: { density: 0.9, friction: 0.4, elasticity: 0.1 },
  Ground: { density: 1.6, friction: 0.45, elasticity: 0.1 },
  Mud: { density: 1.2, friction: 0.55, elasticity: 0.05 },
  Sand: { density: 1.6, friction: 0.5, elasticity: 0.05 },
  Snow: { density: 0.5, friction: 0.3, elasticity: 0.05 },
  Fabric: { density: 0.3, friction: 0.4, elasticity: 0.05 },
  Leather: { density: 0.6, friction: 0.4, elasticity: 0.1 },
  Pebble: { density: 2.7, friction: 0.5, elasticity: 0.1 },
  Rock: { density: 2.7, friction: 0.5, elasticity: 0.1 },
  Salt: { density: 1.2, friction: 0.3, elasticity: 0.05 },
  Limestone: { density: 2.5, friction: 0.45, elasticity: 0.15 },
  Asphalt: { density: 2.4, friction: 0.65, elasticity: 0.1 },
};

const DEFAULT_MATERIAL_PROPERTIES = MATERIAL_PROPERTIES.Plastic;

export function getMaterialProperties(material?: string): MaterialPhysicalProperties {
  return (material && MATERIAL_PROPERTIES[material]) || DEFAULT_MATERIAL_PROPERTIES;
}

type ShapeKind = 'box' | 'sphere';

function getShapeKind(shape?: string): ShapeKind {
  // Cylinder/Wedge/Truss/etc. are approximated by their bounding box — exact
  // cylinder/wedge collision needs more elaborate SAT variants than fit here.
  return shape === 'Ball' ? 'sphere' : 'box';
}

// A part flagged Massless still needs *some* mass to stay numerically stable
// in the solver. Real Roblox instead excludes it from its assembly's total
// mass; since this engine treats every part as its own independent body
// (no welding/assemblies), giving it a small-but-nonzero mass is the closest
// practical equivalent — it gets thrown around easily and barely affects
// whatever it hits, without causing divide-by-zero.
const MASSLESS_MASS = 0.01;

export function computeMass(
  size: Vec3,
  shape: string | undefined,
  material: string | undefined,
  massless: boolean | undefined
): number {
  if (massless) return MASSLESS_MASS;
  const density = getMaterialProperties(material).density;
  const volume =
    getShapeKind(shape) === 'sphere'
      ? (4 / 3) * Math.PI * Math.pow(size[0] / 2, 3)
      : size[0] * size[1] * size[2];
  return Math.max(0.001, volume * density);
}

// Approximate isotropic moment of inertia (I = k * m * r^2) rather than a
// full anisotropic body-fixed tensor rotated into world space every frame.
// A production engine (Roblox's real one included) tracks inertia per-axis;
// this captures the same qualitative behavior — bigger/heavier objects
// resist spinning more, off-center hits impart more spin — without the
// extra tensor math and stabilization that comes with it.
function computeInertia(mass: number, size: Vec3, shape: string | undefined): number {
  if (getShapeKind(shape) === 'sphere') {
    const r = size[0] / 2;
    return Math.max(1e-6, 0.4 * mass * r * r); // solid sphere: (2/5) m r^2
  }
  const [sx, sy, sz] = size;
  // Average of a box's three principal moments, i.e. treated as
  // rotationally equivalent to a sphere of the same mass/extents.
  return Math.max(1e-6, (mass * (sx * sx + sy * sy + sz * sz)) / 18);
}

// ---------------------------------------------------------------------------
// Shape/contact geometry
// ---------------------------------------------------------------------------
interface BoxShape {
  center: Vec3;
  half: Vec3;
  axes: Axes;
}
interface SphereShape {
  center: Vec3;
  radius: number;
}
interface Contact {
  normal: Vec3; // unit vector, points from A to B
  penetration: number;
  point: Vec3; // approximate world-space contact point
}

function projectRadius(half: Vec3, axes: Axes, axis: Vec3): number {
  return (
    Math.abs(half[0] * v3dot(axes.x, axis)) +
    Math.abs(half[1] * v3dot(axes.y, axis)) +
    Math.abs(half[2] * v3dot(axes.z, axis))
  );
}


// Reduced SAT (6 face axes only, not the full 15-axis test that also covers
// edge-edge cases). This handles the overwhelming majority of gameplay
// collisions correctly — stacking, resting, pushing into walls — but can
// miss the rarer edge-on-edge case (e.g. two boxes meeting corner-to-corner
// at an angle).
//
// Returns the axis of minimum penetration plus which box owns it. The actual
// contact points are generated by boxBoxContacts below.
interface SatResult {
  axis: Vec3; // unit, points A -> B
  overlap: number;
  owner: 'A' | 'B';
  index: 0 | 1 | 2; // which of the owner's local axes it is
}

function boxBoxSAT(a: BoxShape, b: BoxShape): SatResult | null {
  const axesA = [a.axes.x, a.axes.y, a.axes.z];
  const axesB = [b.axes.x, b.axes.y, b.axes.z];
  const centerDelta = v3sub(b.center, a.center);
  let best: SatResult | null = null;

  for (let k = 0; k < 6; k++) {
    const owner: 'A' | 'B' = k < 3 ? 'A' : 'B';
    const index = (k % 3) as 0 | 1 | 2;
    const n = v3norm((owner === 'A' ? axesA : axesB)[index]);
    if (v3len(n) < 1e-9) continue;
    const rA = projectRadius(a.half, a.axes, n);
    const rB = projectRadius(b.half, b.axes, n);
    const dist = v3dot(centerDelta, n);
    const overlap = rA + rB - Math.abs(dist);
    if (overlap <= 0) return null; // separating axis found — no collision
    // Near-ties (two aligned boxes give identical overlaps on A's and B's
    // axes) must resolve the same way every frame, otherwise the reference
    // face flips back and forth and the contact points jitter. A's axes win ties.
    const bias = owner === 'B' ? 1e-3 : 0;
    if (!best || overlap + bias < best.overlap) {
      best = { axis: dist < 0 ? v3scale(n, -1) : n, overlap, owner, index };
    }
  }
  return best;
}

// Finds the deepest vertex/edge/face on a box in a given direction
function getSupport(box: BoxShape, dir: Vec3): Vec3 {
  let result = box.center;
  const threshold = 1e-4;

  const dx = v3dot(box.axes.x, dir);
  if (Math.abs(dx) > threshold) {
    result = v3add(result, v3scale(box.axes.x, Math.sign(dx) * box.half[0]));
  }

  const dy = v3dot(box.axes.y, dir);
  if (Math.abs(dy) > threshold) {
    result = v3add(result, v3scale(box.axes.y, Math.sign(dy) * box.half[1]));
  }

  const dz = v3dot(box.axes.z, dir);
  if (Math.abs(dz) > threshold) {
    result = v3add(result, v3scale(box.axes.z, Math.sign(dz) * box.half[2]));
  }

  return result;
}

function closestPointOnBox(box: BoxShape, point: Vec3): Vec3 {
  const d = v3sub(point, box.center);
  let result = box.center;
  const pairs: [Vec3, number][] = [
    [box.axes.x, box.half[0]],
    [box.axes.y, box.half[1]],
    [box.axes.z, box.half[2]],
  ];
  for (const [axis, half] of pairs) {
    const dist = Math.max(-half, Math.min(half, v3dot(d, axis)));
    result = v3add(result, v3scale(axis, dist));
  }
  return result;
}

// Single-point fallback, used only if face clipping yields nothing (e.g. an
// edge-on-edge touch that the reduced SAT can't describe as a face contact).
function boxBoxFallbackContact(a: BoxShape, b: BoxShape, sat: SatResult): Contact {
  const normal = sat.axis;
  let supportPoint: Vec3;
  if (sat.owner === 'A') {
    supportPoint = closestPointOnBox(a, getSupport(b, v3scale(normal, -1)));
  } else {
    supportPoint = closestPointOnBox(b, getSupport(a, normal));
  }
  const rAn = projectRadius(a.half, a.axes, normal);
  const rBn = projectRadius(b.half, b.axes, normal);
  const t = rAn / Math.max(1e-6, rAn + rBn);
  const normalCoord = v3dot(a.center, normal) + (v3dot(b.center, normal) - v3dot(a.center, normal)) * t;
  const currentNormalCoord = v3dot(supportPoint, normal);
  const point = v3add(supportPoint, v3scale(normal, normalCoord - currentNormalCoord));
  return { normal, penetration: sat.overlap, point };
}

// ---------------------------------------------------------------------------
// Contact manifold generation (face clipping)
//
// The old code produced exactly ONE contact point per box pair. A box resting
// flat on the ground therefore only "felt" the floor at a single spot, so
// every impulse also applied a torque: the box rocked from corner to corner,
// stacks toppled, and bodies could fall asleep visibly tilted or half-sunk
// while still rocking slowly. Real engines build a manifold of up to 4 points
// by clipping the incident face against the reference face's side planes
// (Sutherland-Hodgman); with 4 points the box is supported across its whole
// face and settles flat.
// ---------------------------------------------------------------------------
const CONTACT_MARGIN = 0.02; // also keep points this close to touching, so a barely-tilted box still gets all 4 corners

function faceVertices(box: BoxShape, axisIndex: number, sign: number): Vec3[] {
  const ax = [box.axes.x, box.axes.y, box.axes.z];
  const u = (axisIndex + 1) % 3;
  const v = (axisIndex + 2) % 3;
  const c = v3add(box.center, v3scale(ax[axisIndex], sign * box.half[axisIndex]));
  const du = v3scale(ax[u], box.half[u]);
  const dv = v3scale(ax[v], box.half[v]);
  return [v3add(v3add(c, du), dv), v3add(v3sub(c, du), dv), v3sub(v3sub(c, du), dv), v3sub(v3add(c, du), dv)];
}

// Keeps the part of `poly` with dot(n, p) <= d.
function clipPolygon(poly: Vec3[], n: Vec3, d: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = v3dot(n, a) - d;
    const db = v3dot(n, b) - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      out.push(v3add(a, v3scale(v3sub(b, a), da / (da - db))));
    }
  }
  return out;
}

// Clipping can produce up to 8 points when the faces are rotated relative to
// each other. Keep 4 that best span the patch: deepest, farthest from it, and
// the two extremes on either side of the line between those.
function reduceManifold(cs: Contact[]): Contact[] {
  if (cs.length <= 4) return cs;
  let i0 = 0;
  for (let i = 1; i < cs.length; i++) if (cs[i].penetration > cs[i0].penetration) i0 = i;
  let i1 = -1, bestD = -1;
  for (let i = 0; i < cs.length; i++) {
    if (i === i0) continue;
    const d = v3len(v3sub(cs[i].point, cs[i0].point));
    if (d > bestD) { bestD = d; i1 = i; }
  }
  const ab = v3sub(cs[i1].point, cs[i0].point);
  const n = cs[0].normal;
  let i2 = -1, i3 = -1, maxS = -Infinity, minS = Infinity;
  for (let i = 0; i < cs.length; i++) {
    if (i === i0 || i === i1) continue;
    const s = v3dot(v3cross(ab, v3sub(cs[i].point, cs[i0].point)), n);
    if (s > maxS) { maxS = s; i2 = i; }
    if (s < minS) { minS = s; i3 = i; }
  }
  const picked = new Set([i0, i1, i2, i3].filter((i) => i >= 0));
  return Array.from(picked).map((i) => cs[i]);
}

function boxBoxContacts(a: BoxShape, b: BoxShape): Contact[] {
  const sat = boxBoxSAT(a, b);
  if (!sat) return [];

  const refIsA = sat.owner === 'A';
  const ref = refIsA ? a : b;
  const inc = refIsA ? b : a;
  const refAxes = [ref.axes.x, ref.axes.y, ref.axes.z];
  const incAxes = [inc.axes.x, inc.axes.y, inc.axes.z];
  // Outward normal of the reference face (pointing toward the other box).
  const refN = refIsA ? sat.axis : v3scale(sat.axis, -1);
  const ri = sat.index;
  const faceOffset = v3dot(refN, v3add(ref.center, v3scale(refN, ref.half[ri])));

  // Incident face: the face of the other box most anti-parallel to refN.
  let bestI = 0, bestD = 0;
  for (let i = 0; i < 3; i++) {
    const d = v3dot(incAxes[i], refN);
    if (Math.abs(d) > Math.abs(bestD)) { bestD = d; bestI = i; }
  }
  let poly = faceVertices(inc, bestI, bestD > 0 ? -1 : 1);

  // Clip against the four side planes of the reference face.
  for (const ai of [(ri + 1) % 3, (ri + 2) % 3]) {
    const ax = refAxes[ai];
    const c = v3dot(ax, ref.center);
    poly = clipPolygon(poly, ax, c + ref.half[ai]);
    if (poly.length === 0) break;
    poly = clipPolygon(poly, v3scale(ax, -1), -c + ref.half[ai]);
    if (poly.length === 0) break;
  }

  const out: Contact[] = [];
  for (const p of poly) {
    const depth = faceOffset - v3dot(refN, p);
    if (depth < -CONTACT_MARGIN) continue;
    // Drop near-duplicates (clipping a perfectly aligned face produces them).
    if (out.some((o) => v3len(v3sub(o.point, p)) < 1e-4)) continue;
    out.push({ normal: sat.axis, penetration: depth, point: v3add(p, v3scale(refN, depth * 0.5)) });
  }
  if (out.length === 0) return [boxBoxFallbackContact(a, b, sat)];
  return reduceManifold(out);
}

function sphereSphereContact(a: SphereShape, b: SphereShape): Contact | null {
  const delta = v3sub(b.center, a.center);
  const dist = v3len(delta);
  const overlap = a.radius + b.radius - dist;
  if (overlap <= 0) return null;
  const normal = dist > 1e-9 ? v3scale(delta, 1 / dist) : ([0, 1, 0] as Vec3);
  const point = v3add(a.center, v3scale(normal, a.radius));
  return { normal, penetration: overlap, point };
}

// Normal always points from the box's surface toward the sphere's center;
// callers flip it as needed depending on which side is "A" vs "B".
function sphereBoxContact(sphere: SphereShape, box: BoxShape): Contact | null {
  const closest = closestPointOnBox(box, sphere.center);
  const delta = v3sub(sphere.center, closest);
  const dist = v3len(delta);
  if (dist > sphere.radius) return null;
  if (dist > 1e-6) {
    return { normal: v3scale(delta, 1 / dist), penetration: sphere.radius - dist, point: closest };
  }
  // Sphere center is inside the box (e.g. spawned overlapping) — push out
  // along whichever local axis has the least penetration.
  const local = v3sub(sphere.center, box.center);
  const candidates: [Vec3, number][] = [
    [box.axes.x, box.half[0] - Math.abs(v3dot(local, box.axes.x))],
    [box.axes.y, box.half[1] - Math.abs(v3dot(local, box.axes.y))],
    [box.axes.z, box.half[2] - Math.abs(v3dot(local, box.axes.z))],
  ];
  candidates.sort((x, y) => x[1] - y[1]);
  const [axis, overlap] = candidates[0];
  const sign = v3dot(local, axis) < 0 ? -1 : 1;
  return { normal: v3scale(axis, sign), penetration: sphere.radius + overlap, point: closest };
}


// ---------------------------------------------------------------------------
// Per-part runtime info gathered fresh from the tree every step (mirrors the
// existing pattern of not caching size/position/etc. on RigidBodyState).
// ---------------------------------------------------------------------------
interface PhysPart {
  node: TreeNodeData;
  isStatic: boolean;
  canCollide: boolean;
  shape: string | undefined;
  size: Vec3;
  pos: Vec3;
  rot: Vec3;
  axes: Axes;
  mass: number;
  invMass: number;
  invInertia: number;
  boundR: number; // bounding-sphere radius, for the cheap broad-phase reject
}

function toBoxShape(p: PhysPart): BoxShape {
  return { center: p.pos, half: [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2], axes: p.axes };
}
function toSphereShape(p: PhysPart): SphereShape {
  return { center: p.pos, radius: p.size[0] / 2 };
}

// Returns 0..n contact points (box-box can yield a multi-point manifold).
function detectContacts(A: PhysPart, B: PhysPart): Contact[] {
  const kindA = getShapeKind(A.shape);
  const kindB = getShapeKind(B.shape);
  if (kindA === 'box' && kindB === 'box') return boxBoxContacts(toBoxShape(A), toBoxShape(B));
  if (kindA === 'sphere' && kindB === 'sphere') {
    const c = sphereSphereContact(toSphereShape(A), toSphereShape(B));
    return c ? [c] : [];
  }
  if (kindA === 'sphere' && kindB === 'box') {
    const c = sphereBoxContact(toSphereShape(A), toBoxShape(B));
    // c.normal points box(B) -> sphere(A); flip so it points A -> B.
    return c ? [{ ...c, normal: v3scale(c.normal, -1) }] : [];
  }
  // kindA === 'box' && kindB === 'sphere'
  const c = sphereBoxContact(toSphereShape(B), toBoxShape(A));
  // c.normal already points box(A) -> sphere(B), i.e. A -> B.
  return c ? [c] : [];
}

function angularTerm(r: Vec3, n: Vec3, invInertia: number): number {
  if (invInertia === 0) return 0;
  const rxn = v3cross(r, n);
  return invInertia * v3dot(v3cross(rxn, r), n);
}

function tangentBasis(n: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(n[0]) > 0.57735 ? [0, 1, 0] : [1, 0, 0];
  const t1 = v3norm(v3cross(n, helper));
  const t2 = v3cross(n, t1);
  return [t1, t2];
}

function clampVec(v: Vec3, maxLen: number): Vec3 {
  const l = v3len(v);
  return l > maxLen && l > 1e-12 ? v3scale(v, maxLen / l) : v;
}

// Everything the velocity solver needs for one contact point, computed once
// per sub-step so the iterations themselves stay cheap.
interface SolverContact {
  key: string; // pair key, used to look up / store warm-start impulses
  point: Vec3;
  A: PhysPart;
  B: PhysPart;
  bodyA: RigidBodyState;
  bodyB: RigidBodyState;
  n: Vec3;
  t: [Vec3, Vec3];
  rA: Vec3;
  rB: Vec3;
  kn: number; // effective mass denominators
  kt: [number, number];
  targetVn: number; // desired relative normal velocity after solving (bounce, or speculative approach limit)
  mu: number;
  count: number; // points in this pair's manifold
  penetration: number;
  jn: number; // accumulated normal impulse
  jt: [number, number]; // accumulated friction impulses
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const SUB_STEPS = 2;
const SOLVER_ITERATIONS = 8;
const MAX_DT = 0.04;
const LINEAR_DAMPING = 0.99;
const VERTICAL_DAMPING = 0.998;
const ANGULAR_DAMPING = 0.98;
const RESTITUTION_VELOCITY_THRESHOLD = 1.0; // below this, treat bounces as inelastic to kill jitter
const POSITION_CORRECTION_PERCENT = 0.2;
const POSITION_SLOP = 0.01;
const MAX_POSITION_CORRECTION = 0.25; // cap per contact per sub-step so deep overlaps don't explode apart
const MAX_ROTATION_CORRECTION = 0.05; // radians
// A body only falls asleep when it is genuinely resting: touching something,
// and slow for a while. The old thresholds (0.5 studs/s, 0.3 rad/s) were large
// enough that a ball creeping along, or a box rocking slowly on a corner, was
// frozen mid-motion.
const SLEEP_LINEAR_THRESHOLD = 0.15;
const SLEEP_ANGULAR_THRESHOLD = 0.12;
const SLEEP_TIME_THRESHOLD = 0.5; // seconds of stillness before a body sleeps
const REST_SIG_EPSILON = 1e-4;
// Warm starting: contacts re-use last sub-step's impulses (matched by position)
// as their starting guess. Without it every sub-step re-solves from zero, so
// stacks never fully converge in a handful of iterations — they creep, rock and
// stay awake. With it they lock in within a few frames.
const WARM_MATCH_DIST = 0.15;
const WARM_START_FACTOR = 0.95;
const BODY_GC_STEPS = 120; // forget bodies whose part has been missing this long

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}\u0000${idB}` : `${idB}\u0000${idA}`;
}

export class PhysicsEngine {
  private bodies: Map<string, RigidBodyState> = new Map();
  // pair key -> [idA, idB]. Storing the ids (instead of re-splitting the key on
  // ':') keeps touch events correct even if a part id contains the separator.
  private contacts: Map<string, [string, string]> = new Map();
  private externalTransformChanged = false;
  private stepCount = 0;
  private manifoldCache: Map<string, { subDt: number; pts: { point: Vec3; jn: number; jt: Vec3 }[] }> = new Map();
  public gravity: number = 38.0; // Scaled Roblox gravity
  public isSimulating: boolean = false;

  public reset() {
    this.bodies.clear();
    this.contacts.clear();
    this.manifoldCache.clear();
    this.externalTransformChanged = false;
    this.stepCount = 0;
  }

  public setVelocity(id: string, v: [number, number, number]) {
    const b = this.getBody(id);
    b.velocity = [...v];
    this.wake(b);
  }

  public getVelocity(id: string): [number, number, number] {
    const b = this.bodies.get(id);
    return b ? [...b.velocity] : [0, 0, 0];
  }

  public setAngularVelocity(id: string, w: [number, number, number]) {
    const b = this.getBody(id);
    b.angularVelocity = [...w];
    this.wake(b);
  }

  public syncTransform(id: string, position: [number, number, number], rotation: [number, number, number]) {
    const body = this.getBody(id);
    body.velocity = [0, 0, 0];
    body.angularVelocity = [0, 0, 0];
    this.wake(body);
    this.externalTransformChanged = true;
  }

  public getAngularVelocity(id: string): [number, number, number] {
    const b = this.bodies.get(id);
    return b ? [...b.angularVelocity] : [0, 0, 0];
  }

  public isAsleep(id: string): boolean {
    return this.bodies.get(id)?.asleep ?? false;
  }

  private wake(body: RigidBodyState) {
    body.asleep = false;
    body.sleepTimer = 0;
    body.restSig = null;
  }

  private getBody(id: string): RigidBodyState {
    let body = this.bodies.get(id);
    if (!body) {
      body = {
        id,
        velocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        lastPos: [0, 0, 0],
        asleep: false,
        sleepTimer: 0,
        lastSeen: this.stepCount,
      };
      this.bodies.set(id, body);
    }
    return body;
  }

  // Numeric snapshot of a sleeping body plus everything it is resting on.
  // Returns null if one of those partners no longer exists.
  private restSignature(p: PhysPart, partnerIds: string[] | undefined, byId: Map<string, PhysPart>): number[] | null {
    const sig: number[] = [];
    const push = (q: PhysPart) =>
      sig.push(
        q.pos[0], q.pos[1], q.pos[2],
        q.rot[0], q.rot[1], q.rot[2],
        q.size[0], q.size[1], q.size[2],
        q.canCollide ? 1 : 0,
        q.isStatic ? 1 : 0
      );
    push(p);
    for (const id of partnerIds ?? []) {
      const q = byId.get(id);
      if (!q) return null;
      push(q);
    }
    return sig;
  }

  public step(
    nodes: TreeNodeData[],
    rawDelta: number,
    onPositionsUpdated: (updates: Map<string, { position: [number, number, number]; rotation: [number, number, number] }>) => void,
    onTouch?: (nodeId: string, otherNodeId: string, began: boolean) => void
  ) {
    if (!this.isSimulating) return;
    if (!Number.isFinite(rawDelta) || rawDelta <= 0) return;

    // Only clamp the top end (to prevent tunneling during lag spikes). The old
    // code also forced a *minimum* of 5ms, which made the simulation run
    // faster than real time on any display above 200Hz.
    const dt = Math.min(MAX_DT, rawDelta);
    const subDt = dt / SUB_STEPS;
    this.stepCount++;

    // Collect all physical parts in the workspace
    const physicalParts: PhysPart[] = [];

    const traverse = (items: TreeNodeData[]) => {
      for (const item of items) {
        const nameLower = item.name.toLowerCase();
        const isPart =
          item.type === 'object' ||
          item.type === 'part' ||
          item.type === 'spawnlocation' ||
          nameLower === 'baseplate' ||
          nameLower === 'spawnlocation';

        if (isPart) {
          const isBaseplate = nameLower === 'baseplate';
          const defaultPos: Vec3 = getWorldDefaultPosition(item) as Vec3;
          const defaultSize: Vec3 = getWorldDefaultSize(item) as Vec3;

          const pos: Vec3 = item.position ? [...item.position] : defaultPos;
          const rot: Vec3 = item.rotation ? [...item.rotation] : [0, 0, 0];
          const size: Vec3 = item.size ? [...item.size] : defaultSize;
          const scale: Vec3 = item.scale ? [...item.scale] : [1, 1, 1];
          const physicsSize: Vec3 = [
            size[0] * Math.abs(scale[0]),
            size[1] * Math.abs(scale[1]),
            size[2] * Math.abs(scale[2]),
          ];

          // Baseplate is always static regardless of its Anchored value,
          // same as before — it's the one part everything else falls onto
          // by convention. Every other part is exactly as static as its
          // own Anchored property says. There is deliberately no other
          // implicit "floor at Y=0" anymore: just like real Roblox, if
          // there's no anchored/collidable part underneath something, it
          // now falls indefinitely instead of stopping on an invisible
          // plane. See the devlog for this change.
          const isStatic = isBaseplate || item.anchored !== false;
          const canCollide = item.canCollide !== false;

          const mass = computeMass(physicsSize, item.shape, item.material, item.massless);
          const boundR =
            getShapeKind(item.shape) === 'sphere'
              ? physicsSize[0] / 2
              : 0.5 * Math.sqrt(physicsSize[0] ** 2 + physicsSize[1] ** 2 + physicsSize[2] ** 2);

          physicalParts.push({
            node: item,
            isStatic,
            canCollide,
            shape: item.shape,
            size: physicsSize,
            pos,
            rot,
            axes: axesFromMat(rotMatFromEuler(rot[0], rot[1], rot[2])),
            mass,
            invMass: isStatic ? 0 : 1 / mass,
            invInertia: isStatic ? 0 : 1 / computeInertia(mass, physicsSize, item.shape),
            boundR,
          });
        }

        if (item.children && item.children.length > 0) {
          traverse(item.children);
        }
      }
    };

    traverse(nodes);

    const partsById = new Map<string, PhysPart>();
    for (const p of physicalParts) {
      partsById.set(p.node.id, p);
      this.getBody(p.node.id).lastSeen = this.stepCount;
    }

    // Forget bodies of parts that were deleted (with a grace period, so a part
    // that was just created and had its velocity set before it shows up in the
    // tree isn't thrown away). Previously these accumulated forever.
    if (this.stepCount % 60 === 0) {
      for (const [id, b] of this.bodies) {
        if (this.stepCount - (b.lastSeen ?? 0) > BODY_GC_STEPS) this.bodies.delete(id);
      }
    }

    // Moving one part can remove the support from an otherwise sleeping stack.
    // Wake all dynamic bodies so the next contact pass can discover the change.
    if (this.externalTransformChanged) {
      for (const body of this.bodies.values()) this.wake(body);
      this.externalTransformChanged = false;
    }

    // A sleeping body is only skipped by the contact pass, so nothing would
    // ever notice if its floor was moved, deleted or made non-collidable by a
    // script (that doesn't go through syncTransform) — it would stay asleep in
    // mid-air forever. Compare against the snapshot taken when it went to sleep.
    for (const p of physicalParts) {
      if (p.isStatic) continue;
      const body = this.getBody(p.node.id);
      if (!body.asleep) continue;
      const sig = this.restSignature(p, body.restContacts, partsById);
      if (!sig) {
        this.wake(body);
      } else if (!body.restSig) {
        body.restSig = sig; // first step after falling asleep: take the snapshot
      } else if (
        sig.length !== body.restSig.length ||
        sig.some((v, i) => Math.abs(v - (body.restSig as number[])[i]) > REST_SIG_EPSILON)
      ) {
        this.wake(body);
      }
    }

    const currentContacts = new Map<string, [string, string]>();
    const wasAsleep = new Map<string, boolean>();
    for (const p of physicalParts) {
      if (!p.isStatic) wasAsleep.set(p.node.id, this.getBody(p.node.id).asleep);
    }

    for (let sub = 0; sub < SUB_STEPS; sub++) {
      // ---- integrate forces & motion for awake dynamic bodies ----
      for (const p of physicalParts) {
        if (p.isStatic) continue;
        const body = this.getBody(p.node.id);
        if (body.asleep) continue;

        // Gravity — an acceleration, not a force, so mass doesn't affect
        // fall rate (matches real-world/Roblox behavior).
        body.velocity[1] -= this.gravity * subDt;

        // Air damping
        body.velocity[0] *= Math.pow(LINEAR_DAMPING, subDt * 60);
        body.velocity[2] *= Math.pow(LINEAR_DAMPING, subDt * 60);
        body.velocity[1] *= Math.pow(VERTICAL_DAMPING, subDt * 60);
        body.angularVelocity = body.angularVelocity.map(
          (w) => w * Math.pow(ANGULAR_DAMPING, subDt * 60)
        ) as Vec3;

        // Integrate position
        p.pos[0] += body.velocity[0] * subDt;
        p.pos[1] += body.velocity[1] * subDt;
        p.pos[2] += body.velocity[2] * subDt;

        // Integrate orientation (see integrateOrientation for why this
        // isn't just `rot += angularVelocity * dt`)
        const newMat = integrateOrientation(matFromAxes(p.axes), body.angularVelocity, subDt);
        p.rot = eulerFromRotMat(newMat);
        p.axes = axesFromMat(newMat);
      }

      // ---- broad + narrow phase collision detection ----
      const manifolds: { key: string; A: PhysPart; B: PhysPart; points: Contact[] }[] = [];
      for (let i = 0; i < physicalParts.length; i++) {
        for (let j = i + 1; j < physicalParts.length; j++) {
          const A = physicalParts[i];
          const B = physicalParts[j];
          if (A.isStatic && B.isStatic) continue;
          if (!A.canCollide || !B.canCollide) continue;

          const bodyA = this.getBody(A.node.id);
          const bodyB = this.getBody(B.node.id);
          const key = pairKey(A.node.id, B.node.id);

          if ((A.isStatic || bodyA.asleep) && (B.isStatic || bodyB.asleep)) {
            // Neither side is simulated, so no detection runs — but they ARE
            // still touching. Carry the contact over; otherwise every body
            // fires a bogus TouchEnded the moment it falls asleep.
            if (this.contacts.has(key)) currentContacts.set(key, this.contacts.get(key)!);
            continue;
          }

          // Cheap bounding-sphere reject before the expensive SAT.
          const dx = A.pos[0] - B.pos[0], dy = A.pos[1] - B.pos[1], dz = A.pos[2] - B.pos[2];
          const reach = A.boundR + B.boundR + CONTACT_MARGIN;
          if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

          const points = detectContacts(A, B);
          if (points.length === 0) continue;

          currentContacts.set(key, A.node.id < B.node.id ? [A.node.id, B.node.id] : [B.node.id, A.node.id]);
          manifolds.push({ key, A, B, points });

          // Something awake hit a sleeping body — wake it.
          if (!A.isStatic && bodyA.asleep) this.wake(bodyA);
          if (!B.isStatic && bodyB.asleep) this.wake(bodyB);
        }
      }

      // ---- build solver contacts (once per sub-step) ----
      const solverContacts: SolverContact[] = [];
      for (const { key, A, B, points } of manifolds) {
        const cached = this.manifoldCache.get(key);
        const usedCache = new Set<number>();
        const bodyA = this.getBody(A.node.id);
        const bodyB = this.getBody(B.node.id);
        const matA = getMaterialProperties(A.node.material);
        const matB = getMaterialProperties(B.node.material);
        const elasticity = (matA.elasticity + matB.elasticity) / 2;
        const mu = (matA.friction + matB.friction) / 2;
        const invMassSum = A.invMass + B.invMass;

        for (const info of points) {
          const n = info.normal;
          const rA = v3sub(info.point, A.pos);
          const rB = v3sub(info.point, B.pos);
          const t = tangentBasis(n);
          const kn = invMassSum + angularTerm(rA, n, A.invInertia) + angularTerm(rB, n, B.invInertia);
          if (kn <= 1e-9) continue;
          const kt: [number, number] = [
            invMassSum + angularTerm(rA, t[0], A.invInertia) + angularTerm(rB, t[0], B.invInertia),
            invMassSum + angularTerm(rA, t[1], A.invInertia) + angularTerm(rB, t[1], B.invInertia),
          ];

          const velAtA = A.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyA.velocity, v3cross(bodyA.angularVelocity, rA));
          const velAtB = B.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyB.velocity, v3cross(bodyB.angularVelocity, rB));
          const vn0 = v3dot(v3sub(velAtB, velAtA), n);

          // Real contact: bounce only for fast impacts, otherwise inelastic.
          // Speculative contact (a gap, not yet touching): allow the bodies to
          // approach by at most the gap in the next sub-step.
          const targetVn =
            info.penetration >= 0
              ? -vn0 > RESTITUTION_VELOCITY_THRESHOLD
                ? elasticity * -vn0
                : 0
              : info.penetration / subDt;

          // Warm start from the nearest matching point of last sub-step's manifold.
          let jn = 0;
          const jt: [number, number] = [0, 0];
          if (cached) {
            let bi = -1;
            let bd = WARM_MATCH_DIST;
            for (let k = 0; k < cached.pts.length; k++) {
              if (usedCache.has(k)) continue;
              const d = v3len(v3sub(info.point, cached.pts[k].point));
              if (d < bd) { bd = d; bi = k; }
            }
            if (bi >= 0) {
              usedCache.add(bi);
              const s = (subDt / cached.subDt) * WARM_START_FACTOR; // impulses scale with the time step
              jn = cached.pts[bi].jn * s;
              jt[0] = v3dot(cached.pts[bi].jt, t[0]) * s;
              jt[1] = v3dot(cached.pts[bi].jt, t[1]) * s;
            }
          }

          solverContacts.push({
            key, point: info.point,
            A, B, bodyA, bodyB, n, t, rA, rB, kn, kt, targetVn, mu,
            count: points.length,
            penetration: info.penetration,
            jn,
            jt,
          });
        }
      }

      const applyImpulse = (c: SolverContact, imp: Vec3) => {
        if (!c.A.isStatic) {
          c.bodyA.velocity = v3sub(c.bodyA.velocity, v3scale(imp, c.A.invMass));
          c.bodyA.angularVelocity = v3sub(c.bodyA.angularVelocity, v3scale(v3cross(c.rA, imp), c.A.invInertia));
        }
        if (!c.B.isStatic) {
          c.bodyB.velocity = v3add(c.bodyB.velocity, v3scale(imp, c.B.invMass));
          c.bodyB.angularVelocity = v3add(c.bodyB.angularVelocity, v3scale(v3cross(c.rB, imp), c.B.invInertia));
        }
      };
      const relVelAt = (c: SolverContact): Vec3 => {
        const vA = c.A.isStatic ? ([0, 0, 0] as Vec3) : v3add(c.bodyA.velocity, v3cross(c.bodyA.angularVelocity, c.rA));
        const vB = c.B.isStatic ? ([0, 0, 0] as Vec3) : v3add(c.bodyB.velocity, v3cross(c.bodyB.angularVelocity, c.rB));
        return v3sub(vB, vA);
      };

      // ---- apply warm-start impulses ----
      for (const c of solverContacts) {
        if (c.jn === 0 && c.jt[0] === 0 && c.jt[1] === 0) continue;
        applyImpulse(c, v3add(v3add(v3scale(c.n, c.jn), v3scale(c.t[0], c.jt[0])), v3scale(c.t[1], c.jt[1])));
      }

      // ---- iterative sequential-impulse solver (velocity) ----
      // Impulses are *accumulated* per contact and the accumulated total is
      // clamped (normal >= 0, friction <= mu * normal). The old solver clamped
      // each iteration's increment on its own and capped friction by that
      // iteration's normal impulse — which is ~0 after the first iteration, so
      // friction effectively only ever acted once and skipped entirely whenever
      // a contact looked momentarily separating.
      for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
        for (const c of solverContacts) {
          // normal
          const vn = v3dot(relVelAt(c), c.n);
          const newJn = Math.max(0, c.jn + (c.targetVn - vn) / c.kn);
          const dJn = newJn - c.jn;
          c.jn = newJn;
          if (dJn !== 0) applyImpulse(c, v3scale(c.n, dJn));

          // friction (Coulomb cone, approximated per tangent axis)
          const maxF = c.mu * c.jn;
          for (let k = 0; k < 2; k++) {
            if (c.kt[k] <= 1e-9) continue;
            const vt = v3dot(relVelAt(c), c.t[k]);
            const other = c.jt[1 - k];
            const lim = Math.sqrt(Math.max(0, maxF * maxF - other * other));
            const newJt = Math.max(-lim, Math.min(lim, c.jt[k] - vt / c.kt[k]));
            const dJt = newJt - c.jt[k];
            c.jt[k] = newJt;
            if (dJt !== 0) applyImpulse(c, v3scale(c.t[k], dJt));
          }
        }
      }

      // ---- positional correction (Baumgarte stabilization) ----
      // Nudges both bodies apart proportional to mass/inertia to resolve penetration.
      // Applying this to both position AND rotation ensures resting on edges
      // properly settles flat instead of magically hovering. Each point only
      // applies its share of the correction (1 / points in the manifold),
      // otherwise a 4-point face contact would push 4x as hard.
      for (const c of solverContacts) {
        const { A, B, n, rA, rB } = c;
        const excess = c.penetration - POSITION_SLOP;
        if (excess <= 0) continue;

        const correctionMag = (Math.min(excess, MAX_POSITION_CORRECTION) / c.kn) * POSITION_CORRECTION_PERCENT;
        const posImpulse = v3scale(n, correctionMag);

        if (!A.isStatic) {
          A.pos = v3sub(A.pos, v3scale(posImpulse, A.invMass));
          const rotCorr = clampVec(v3scale(v3cross(rA, posImpulse), -A.invInertia), MAX_ROTATION_CORRECTION);
          const newMat = integrateOrientation(matFromAxes(A.axes), rotCorr, 1.0);
          A.rot = eulerFromRotMat(newMat);
          A.axes = axesFromMat(newMat);
        }
        if (!B.isStatic) {
          B.pos = v3add(B.pos, v3scale(posImpulse, B.invMass));
          const rotCorr = clampVec(v3scale(v3cross(rB, posImpulse), B.invInertia), MAX_ROTATION_CORRECTION);
          const newMat = integrateOrientation(matFromAxes(B.axes), rotCorr, 1.0);
          B.rot = eulerFromRotMat(newMat);
          B.axes = axesFromMat(newMat);
        }
      }

      // ---- remember impulses for warm-starting the next sub-step ----
      const nextCache = new Map<string, { subDt: number; pts: { point: Vec3; jn: number; jt: Vec3 }[] }>();
      for (const c of solverContacts) {
        let entry = nextCache.get(c.key);
        if (!entry) nextCache.set(c.key, (entry = { subDt, pts: [] }));
        entry.pts.push({
          point: c.point,
          jn: c.jn,
          jt: v3add(v3scale(c.t[0], c.jt[0]), v3scale(c.t[1], c.jt[1])),
        });
      }
      this.manifoldCache = nextCache;
    }

    // ---- sleep bookkeeping (island based) + collect updates ----
    const partners = new Map<string, string[]>();
    for (const [first, second] of currentContacts.values()) {
      (partners.get(first) ?? partners.set(first, []).get(first)!).push(second);
      (partners.get(second) ?? partners.set(second, []).get(second)!).push(first);
    }

    // 1. Per-body stillness timers. A body must be touching something: one that
    //    is merely slow — at the apex of a throw, or a freshly spawned part in
    //    mid-air — is not at rest and must never be put to sleep.
    for (const p of physicalParts) {
      if (p.isStatic) continue;
      const body = this.getBody(p.node.id);
      if (body.asleep) continue;
      const still =
        partners.has(p.node.id) &&
        v3len(body.velocity) < SLEEP_LINEAR_THRESHOLD &&
        v3len(body.angularVelocity) < SLEEP_ANGULAR_THRESHOLD;
      body.sleepTimer = still ? body.sleepTimer + dt : 0;
    }

    // 2. Group touching dynamic bodies into islands and put a whole island to
    //    sleep at once. Sleeping each body on its own timer made neighbours
    //    ping-pong: the first to doze off was immediately woken again by an
    //    awake neighbour touching it, so a stack could take forever to settle
    //    (or flicker asleep/awake) instead of sleeping as one unit.
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      while (id !== root) {
        const next = parent.get(id)!;
        parent.set(id, root);
        id = next;
      }
      return root;
    };
    for (const p of physicalParts) {
      if (!p.isStatic && partners.has(p.node.id)) parent.set(p.node.id, p.node.id);
    }
    for (const [a, b] of currentContacts.values()) {
      if (parent.has(a) && parent.has(b)) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
    const islands = new Map<string, string[]>();
    for (const id of parent.keys()) {
      const r = find(id);
      (islands.get(r) ?? islands.set(r, []).get(r)!).push(id);
    }
    for (const members of islands.values()) {
      let anyAwake = false;
      let ready = true;
      for (const id of members) {
        const b = this.getBody(id);
        if (b.asleep) continue;
        anyAwake = true;
        if (b.sleepTimer <= SLEEP_TIME_THRESHOLD) { ready = false; break; }
      }
      if (!anyAwake || !ready) continue;
      for (const id of members) {
        const b = this.getBody(id);
        if (b.asleep) continue;
        b.asleep = true;
        b.velocity = [0, 0, 0];
        b.angularVelocity = [0, 0, 0];
        b.restContacts = [...(partners.get(id) ?? [])];
        b.restSig = null; // snapshotted at the start of the next step
      }
    }

    const positionUpdates = new Map<string, { position: [number, number, number]; rotation: [number, number, number] }>();
    for (const p of physicalParts) {
      if (p.isStatic) continue;
      const body = this.getBody(p.node.id);

      // Skip re-sending positions for parts that were already asleep before
      // this step and still are — nothing changed, no need to trigger a
      // tree update / re-render for it every frame.
      if (body.asleep && wasAsleep.get(p.node.id)) continue;

      positionUpdates.set(p.node.id, {
        position: [p.pos[0], p.pos[1], p.pos[2]],
        rotation: [p.rot[0], p.rot[1], p.rot[2]],
      });
    }

    if (positionUpdates.size > 0) {
      onPositionsUpdated(positionUpdates);
    }

    if (onTouch) {
      for (const [key, [first, second]] of currentContacts) {
        if (!this.contacts.has(key)) {
          onTouch(first, second, true);
          onTouch(second, first, true);
        }
      }
      for (const [key, [first, second]] of this.contacts) {
        if (!currentContacts.has(key)) {
          onTouch(first, second, false);
          onTouch(second, first, false);
        }
      }
    }
    this.contacts = currentContacts;
  }
}

export const globalPhysicsEngine = new PhysicsEngine();