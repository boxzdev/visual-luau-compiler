import { TreeNodeData } from './luaRunner';

export interface RigidBodyState {
  id: string;
  velocity: [number, number, number];
  angularVelocity: [number, number, number]; // radians/sec, world space
  lastPos: [number, number, number];
  asleep: boolean;
  sleepTimer: number;
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
  const r10 = m[1][0], r11 = m[1][1], r12 = m[1][2];
  const r20 = m[2][0], r21 = m[2][1], r22 = m[2][2];
  const sy = Math.max(-1, Math.min(1, r02));
  const ry = Math.asin(sy);
  let rx: number, rz: number;
  if (Math.abs(Math.cos(ry)) > 1e-6) {
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

function integrateOrientation(m: Mat3, angularVelocity: Vec3, dt: number): Mat3 {
  // dR/dt = skew(omega) * R, i.e. for each column c of R: dc/dt = omega x c.
  // Integrating the rotation matrix itself (rather than naively adding
  // angularVelocity * dt straight onto the stored Euler angles) avoids
  // gimbal-lock artifacts mid-spin. We only convert back to Euler at the end
  // of the step, for storage, matching how the rest of the app represents
  // rotation.
  const cols: Vec3[] = [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
  const next = cols.map((c) => v3add(c, v3scale(v3cross(angularVelocity, c), dt)));
  const raw: Mat3 = [
    [next[0][0], next[1][0], next[2][0]],
    [next[0][1], next[1][1], next[2][1]],
    [next[0][2], next[1][2], next[2][2]],
  ];
  return orthonormalize(raw);
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
// at an angle). A full SAT implementation would close that gap at the cost
// of a good deal more code; this is the same tradeoff many simplified game
// physics engines make.
function boxBoxContact(a: BoxShape, b: BoxShape): Contact | null {
  const axesToTest: { axis: Vec3; owner: 'A' | 'B' }[] = [
    { axis: a.axes.x, owner: 'A' },
    { axis: a.axes.y, owner: 'A' },
    { axis: a.axes.z, owner: 'A' },
    { axis: b.axes.x, owner: 'B' },
    { axis: b.axes.y, owner: 'B' },
    { axis: b.axes.z, owner: 'B' },
  ];
  const centerDelta = v3sub(b.center, a.center);
  let minOverlap = Infinity;
  let minAxis: Vec3 | null = null;
  let minOwner: 'A' | 'B' | null = null;
  
  for (const { axis, owner } of axesToTest) {
    const n = v3norm(axis);
    if (v3len(n) < 1e-9) continue;
    const rA = projectRadius(a.half, a.axes, n);
    const rB = projectRadius(b.half, b.axes, n);
    const dist = v3dot(centerDelta, n);
    const overlap = rA + rB - Math.abs(dist);
    if (overlap <= 0) return null; // separating axis found — no collision
    if (overlap < minOverlap) {
      minOverlap = overlap;
      minAxis = dist < 0 ? v3scale(n, -1) : n; // keep it pointing A -> B
      minOwner = owner;
    }
  }
  if (!minAxis || !minOwner) return null;
  const point = boxBoxContactPoint(a, b, minAxis, minOwner);
  return { normal: minAxis, penetration: minOverlap, point };
}

// Finds the deepest vertex/edge/face on a box in a given direction
function getSupport(box: BoxShape, dir: Vec3): Vec3 {
  let result = box.center;
  const threshold = 1e-4; // If perfectly flat within ~0.005 degrees, it rests cleanly on the face center
  
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

function boxBoxContactPoint(a: BoxShape, b: BoxShape, normal: Vec3, minOwner: 'A' | 'B'): Vec3 {
  let supportPoint: Vec3;
  if (minOwner === 'A') {
    // A's face is the separating plane. Deepest point of B into A is its support point opposite to normal.
    supportPoint = getSupport(b, v3scale(normal, -1));
    supportPoint = closestPointOnBox(a, supportPoint); // Clamp overhangs
  } else {
    // B's face is the separating plane. Deepest point of A into B is its support point along normal.
    supportPoint = getSupport(a, normal);
    supportPoint = closestPointOnBox(b, supportPoint); // Clamp overhangs
  }

  const rAn = projectRadius(a.half, a.axes, normal);
  const rBn = projectRadius(b.half, b.axes, normal);
  const t = rAn / Math.max(1e-6, rAn + rBn);
  const normalCoord = v3dot(a.center, normal) + (v3dot(b.center, normal) - v3dot(a.center, normal)) * t;
  
  // Snap the support point exactly onto the overlapping contact plane
  const currentNormalCoord = v3dot(supportPoint, normal);
  return v3add(supportPoint, v3scale(normal, normalCoord - currentNormalCoord));
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
}

function toBoxShape(p: PhysPart): BoxShape {
  return { center: p.pos, half: [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2], axes: p.axes };
}
function toSphereShape(p: PhysPart): SphereShape {
  return { center: p.pos, radius: p.size[0] / 2 };
}

function detectContact(A: PhysPart, B: PhysPart): Contact | null {
  const kindA = getShapeKind(A.shape);
  const kindB = getShapeKind(B.shape);
  if (kindA === 'box' && kindB === 'box') return boxBoxContact(toBoxShape(A), toBoxShape(B));
  if (kindA === 'sphere' && kindB === 'sphere') return sphereSphereContact(toSphereShape(A), toSphereShape(B));
  if (kindA === 'sphere' && kindB === 'box') {
    const c = sphereBoxContact(toSphereShape(A), toBoxShape(B));
    // c.normal points box(B) -> sphere(A); flip so it points A -> B.
    return c ? { ...c, normal: v3scale(c.normal, -1) } : null;
  }
  // kindA === 'box' && kindB === 'sphere'
  const c = sphereBoxContact(toSphereShape(B), toBoxShape(A));
  // c.normal already points box(A) -> sphere(B), i.e. A -> B.
  return c;
}

function angularTerm(r: Vec3, n: Vec3, invInertia: number): number {
  if (invInertia === 0) return 0;
  const rxn = v3cross(r, n);
  return invInertia * v3dot(v3cross(rxn, r), n);
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const SUB_STEPS = 2;
const SOLVER_ITERATIONS = 4;
const LINEAR_DAMPING = 0.99;
const VERTICAL_DAMPING = 0.998;
const ANGULAR_DAMPING = 0.98;
const RESTITUTION_VELOCITY_THRESHOLD = 1.0; // below this, treat bounces as inelastic to kill jitter
const POSITION_CORRECTION_PERCENT = 0.2;
const POSITION_SLOP = 0.01;
const SLEEP_LINEAR_THRESHOLD = 0.5;
const SLEEP_ANGULAR_THRESHOLD = 0.3;
const SLEEP_TIME_THRESHOLD = 0.5; // seconds of stillness before a body sleeps

export class PhysicsEngine {
  private bodies: Map<string, RigidBodyState> = new Map();
  private contacts: Set<string> = new Set();
  private externalTransformChanged = false;
  public gravity: number = 38.0; // Scaled Roblox gravity
  public isSimulating: boolean = false;

  public reset() {
    this.bodies.clear();
    this.contacts.clear();
    this.externalTransformChanged = false;
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
      };
      this.bodies.set(id, body);
    }
    return body;
  }

  public step(
    nodes: TreeNodeData[],
    rawDelta: number,
    onPositionsUpdated: (updates: Map<string, { position: [number, number, number]; rotation: [number, number, number] }>) => void,
    onTouch?: (nodeId: string, otherNodeId: string, began: boolean) => void
  ) {
    if (!this.isSimulating) return;

    // Clamp delta to prevent tunneling during lag spikes
    const dt = Math.min(0.04, Math.max(0.005, rawDelta));
    const subDt = dt / SUB_STEPS;

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
          const isSpawn = item.type === 'spawnlocation' || nameLower === 'spawnlocation';
          const defaultPos: Vec3 = isBaseplate ? [0, -0.5, 0] : isSpawn ? [0, 0.5, 0] : [0, 5, 0];
          const defaultSize: Vec3 = isBaseplate ? [512, 1, 512] : isSpawn ? [12, 1, 12] : [4, 4, 4];

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
          });
        }

        if (item.children && item.children.length > 0) {
          traverse(item.children);
        }
      }
    };

    traverse(nodes);

    // Moving one part can remove the support from an otherwise sleeping stack.
    // Wake all dynamic bodies so the next contact pass can discover the change.
    if (this.externalTransformChanged) {
      for (const body of this.bodies.values()) this.wake(body);
      this.externalTransformChanged = false;
    }

    const currentContacts = new Set<string>();
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
        const mat = rotMatFromEuler(p.rot[0], p.rot[1], p.rot[2]);
        const newMat = integrateOrientation(mat, body.angularVelocity, subDt);
        p.rot = eulerFromRotMat(newMat);
        p.axes = axesFromMat(newMat);
      }

      // ---- broad + narrow phase collision detection ----
      const contacts: { A: PhysPart; B: PhysPart; info: Contact }[] = [];
      for (let i = 0; i < physicalParts.length; i++) {
        for (let j = i + 1; j < physicalParts.length; j++) {
          const A = physicalParts[i];
          const B = physicalParts[j];
          if (A.isStatic && B.isStatic) continue;
          if (!A.canCollide || !B.canCollide) continue;

          const bodyA = this.getBody(A.node.id);
          const bodyB = this.getBody(B.node.id);
          if ((A.isStatic || bodyA.asleep) && (B.isStatic || bodyB.asleep)) continue;

          const info = detectContact(A, B);
          if (!info) continue;

          const key = A.node.id < B.node.id ? `${A.node.id}:${B.node.id}` : `${B.node.id}:${A.node.id}`;
          currentContacts.add(key);
          contacts.push({ A, B, info });

          // Something awake and dynamic hit a sleeping body — wake it.
          if (bodyA.asleep && !A.isStatic && (!B.isStatic ? !bodyB.asleep : true)) this.wake(bodyA);
          if (bodyB.asleep && !B.isStatic && (!A.isStatic ? !bodyA.asleep : true)) this.wake(bodyB);
        }
      }

      // ---- iterative sequential-impulse solver (velocity) ----
      for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
        for (const { A, B, info } of contacts) {
          const bodyA = this.getBody(A.node.id);
          const bodyB = this.getBody(B.node.id);
          const n = info.normal;
          const rA = v3sub(info.point, A.pos);
          const rB = v3sub(info.point, B.pos);

          const velAtA = A.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyA.velocity, v3cross(bodyA.angularVelocity, rA));
          const velAtB = B.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyB.velocity, v3cross(bodyB.angularVelocity, rB));
          const relVel = v3sub(velAtB, velAtA);
          const velAlongNormal = v3dot(relVel, n);
          if (velAlongNormal > 0) continue; // already separating

          const invMassSum = A.invMass + B.invMass;
          const denom =
            invMassSum + angularTerm(rA, n, A.invInertia) + angularTerm(rB, n, B.invInertia);
          if (denom <= 1e-9) continue;

          const restitution =
            Math.abs(velAlongNormal) > RESTITUTION_VELOCITY_THRESHOLD
              ? (getMaterialProperties(A.node.material).elasticity + getMaterialProperties(B.node.material).elasticity) / 2
              : 0;

          const j = (-(1 + restitution) * velAlongNormal) / denom;
          const impulse = v3scale(n, j);

          if (!A.isStatic) {
            bodyA.velocity = v3sub(bodyA.velocity, v3scale(impulse, A.invMass));
            bodyA.angularVelocity = v3sub(bodyA.angularVelocity, v3scale(v3cross(rA, impulse), A.invInertia));
          }
          if (!B.isStatic) {
            bodyB.velocity = v3add(bodyB.velocity, v3scale(impulse, B.invMass));
            bodyB.angularVelocity = v3add(bodyB.angularVelocity, v3scale(v3cross(rB, impulse), B.invInertia));
          }

          // ---- friction (Coulomb), clamped to the normal impulse ----
          const velAtA2 = A.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyA.velocity, v3cross(bodyA.angularVelocity, rA));
          const velAtB2 = B.isStatic ? ([0, 0, 0] as Vec3) : v3add(bodyB.velocity, v3cross(bodyB.angularVelocity, rB));
          const relVel2 = v3sub(velAtB2, velAtA2);
          const tangentRaw = v3sub(relVel2, v3scale(n, v3dot(relVel2, n)));
          const tangentLen = v3len(tangentRaw);
          if (tangentLen > 1e-6) {
            const tangent = v3scale(tangentRaw, 1 / tangentLen);
            const denomT =
              invMassSum + angularTerm(rA, tangent, A.invInertia) + angularTerm(rB, tangent, B.invInertia);
            if (denomT > 1e-9) {
              const jt = -v3dot(relVel2, tangent) / denomT;
              const friction =
                (getMaterialProperties(A.node.material).friction + getMaterialProperties(B.node.material).friction) / 2;
              const maxFriction = friction * Math.abs(j);
              const jtClamped = Math.max(-maxFriction, Math.min(maxFriction, jt));
              const frictionImpulse = v3scale(tangent, jtClamped);

              if (!A.isStatic) {
                bodyA.velocity = v3sub(bodyA.velocity, v3scale(frictionImpulse, A.invMass));
                bodyA.angularVelocity = v3sub(bodyA.angularVelocity, v3scale(v3cross(rA, frictionImpulse), A.invInertia));
              }
              if (!B.isStatic) {
                bodyB.velocity = v3add(bodyB.velocity, v3scale(frictionImpulse, B.invMass));
                bodyB.angularVelocity = v3add(bodyB.angularVelocity, v3scale(v3cross(rB, frictionImpulse), B.invInertia));
              }
            }
          }
        }
      }

      // ---- positional correction (Baumgarte stabilization) ----
      // Nudges both bodies apart proportional to mass/inertia to resolve penetration.
      // Applying this to both position AND rotation ensures resting on edges
      // properly settles flat instead of magically hovering.
      for (const { A, B, info } of contacts) {
        const n = info.normal;
        const rA = v3sub(info.point, A.pos);
        const rB = v3sub(info.point, B.pos);
        
        const denom =
          A.invMass + B.invMass + angularTerm(rA, n, A.invInertia) + angularTerm(rB, n, B.invInertia);
        if (denom <= 1e-9) continue;
        
        const correctionMag = (Math.max(info.penetration - POSITION_SLOP, 0) / denom) * POSITION_CORRECTION_PERCENT;
        const posImpulse = v3scale(n, correctionMag);

        if (!A.isStatic) {
          A.pos = v3sub(A.pos, v3scale(posImpulse, A.invMass));
          const rotCorr = v3scale(v3cross(rA, posImpulse), -A.invInertia);
          
          const mat = rotMatFromEuler(A.rot[0], A.rot[1], A.rot[2]);
          const newMat = integrateOrientation(mat, rotCorr, 1.0);
          A.rot = eulerFromRotMat(newMat);
          A.axes = axesFromMat(newMat);
        }
        if (!B.isStatic) {
          B.pos = v3add(B.pos, v3scale(posImpulse, B.invMass));
          const rotCorr = v3scale(v3cross(rB, posImpulse), B.invInertia);
          
          const mat = rotMatFromEuler(B.rot[0], B.rot[1], B.rot[2]);
          const newMat = integrateOrientation(mat, rotCorr, 1.0);
          B.rot = eulerFromRotMat(newMat);
          B.axes = axesFromMat(newMat);
        }
      }
    }

    // ---- sleep bookkeeping + collect updates ----
    const positionUpdates = new Map<string, { position: [number, number, number]; rotation: [number, number, number] }>();
    for (const p of physicalParts) {
      if (p.isStatic) continue;
      const body = this.getBody(p.node.id);

      if (!body.asleep) {
        const speed = v3len(body.velocity);
        const angSpeed = v3len(body.angularVelocity);
        if (speed < SLEEP_LINEAR_THRESHOLD && angSpeed < SLEEP_ANGULAR_THRESHOLD) {
          body.sleepTimer += dt;
          if (body.sleepTimer > SLEEP_TIME_THRESHOLD) {
            body.asleep = true;
            body.velocity = [0, 0, 0];
            body.angularVelocity = [0, 0, 0];
          }
        } else {
          body.sleepTimer = 0;
        }
      }

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
      for (const contact of currentContacts) {
        if (!this.contacts.has(contact)) {
          const [first, second] = contact.split(':');
          onTouch(first, second, true);
          onTouch(second, first, true);
        }
      }
      for (const contact of this.contacts) {
        if (!currentContacts.has(contact)) {
          const [first, second] = contact.split(':');
          onTouch(first, second, false);
          onTouch(second, first, false);
        }
      }
    }
    this.contacts = currentContacts;
  }
}

export const globalPhysicsEngine = new PhysicsEngine();