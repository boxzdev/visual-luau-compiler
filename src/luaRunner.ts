import { LuaFactory, LuaEngine } from 'wasmoon';
import glueUrl from 'wasmoon/dist/glue.wasm?url';
import { globalPhysicsEngine, computeMass } from './physicsEngine';

export type LogType = 'print' | 'warn' | 'error' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
}

export type TreeNodeData = {
  id: string;
  name: string;
  type: string;
  children: TreeNodeData[];
  expanded?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  size?: [number, number, number];
  transparency?: number;
  reflectance?: number;
  anchored?: boolean;
  locked?: boolean;
  canCollide?: boolean;
  canTouch?: boolean;
  canQuery?: boolean;
  audioCanCollide?: boolean;
  collisionGroup?: string;
  massless?: boolean;
  rootPriority?: number;
  shape?: string;
  material?: string;
  castShadow?: boolean;
  archivable?: boolean;
  disabled?: boolean;
  ambientColor?: string;
  outdoorAmbient?: string;
  brightness?: number;
  colorShiftTop?: string;
  colorShiftBottom?: string;
  clockTime?: number;
  geographicLatitude?: number;
  fogColor?: string;
  fogStart?: number;
  fogEnd?: number;
  shadowSoftness?: number;
  globalShadows?: boolean;
  exposureCompensation?: number;
  environmentDiffuseScale?: number;
  environmentSpecularScale?: number;
  skyEnabled?: boolean;
  fogEnabled?: boolean;
  ambientIntensity?: number;
  sunAngle?: number;
  // Light properties (PointLight / SpotLight / SurfaceLight)
  range?: number;
  lightBrightness?: number;
  lightColor?: string;
  shadows?: boolean;
  angle?: number;
  face?: 'Top' | 'Bottom' | 'Front' | 'Back' | 'Left' | 'Right' | string;
  enabled?: boolean;
  // Sky properties
  skyboxBk?: string;
  skyboxDn?: string;
  skyboxFt?: string;
  skyboxLf?: string;
  skyboxRt?: string;
  skyboxUp?: string;
  sunTextureId?: string;
  moonTextureId?: string;
  sunAngularSize?: number;
  moonAngularSize?: number;
  celestialBodiesShown?: boolean;
  starCount?: number;
  // Atmosphere properties
  density?: number;
  offset?: number;
  decay?: string;
  glare?: number;
  haze?: number;
  // Post processing effect properties
  contrast?: number;
  saturation?: number;
  tintColor?: string;
  intensity?: number;
  threshold?: number;
  spread?: number;
  effectSize?: number;
  farIntensity?: number;
  focusDistance?: number;
  inFocusRadius?: number;
  nearIntensity?: number;
  primaryPartId?: string;
  technology?: string;
  // Decal and Texture properties
  texture?: string;
  studsPerTileU?: number;
  studsPerTileV?: number;
  offsetStudsU?: number;
  offsetStudsV?: number;
  zIndex?: number;
};

export const LIGHTING_DEFAULTS = {
  ambientColor: '#000000',
  outdoorAmbient: '#808080',
  brightness: 2,
  colorShiftTop: '#000000',
  colorShiftBottom: '#000000',
  clockTime: 14,
  geographicLatitude: 41.733,
  fogColor: '#c0c0c0',
  fogStart: 0,
  fogEnd: 100000,
  shadowSoftness: 0.2,
  globalShadows: true,
  exposureCompensation: 0,
  environmentDiffuseScale: 1,
  environmentSpecularScale: 1,
  skyEnabled: true,
  fogEnabled: true,
  ambientIntensity: 1,
  sunAngle: 0,
  technology: 'ShadowMap',
} as const;

export function calculateCelestialDirections(
  clockTime: number = LIGHTING_DEFAULTS.clockTime,
  geographicLatitude: number = LIGHTING_DEFAULTS.geographicLatitude,
  sunAngle: number = 0
) {
  const theta = (((clockTime - 6) / 24) * Math.PI * 2) + ((sunAngle * Math.PI) / 180);
  const phi = (geographicLatitude * Math.PI) / 180;

  // Sun direction unit vector in Roblox world coords (+Y up, +X East, +Z South)
  let sx = -Math.cos(theta);
  let sy = Math.sin(theta) * Math.cos(phi);
  let sz = Math.sin(theta) * Math.sin(phi);

  const len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
  sx /= len;
  sy /= len;
  sz /= len;

  const mx = -sx;
  const my = -sy;
  const mz = -sz;

  return {
    sunDirection: [sx, sy, sz] as [number, number, number],
    moonDirection: [mx, my, mz] as [number, number, number],
    isDay: sy > 0,
    elevation: sy,
  };
}

export function clockTimeToTimeOfDay(clock: number): string {
  const t = ((Number(clock) % 24) + 24) % 24;
  const hours = Math.floor(t);
  const minutesFloat = (t - hours) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.min(59, Math.floor((minutesFloat - minutes) * 60));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function timeOfDayToClockTime(value: string): number {
  const parts = String(value).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const s = Number(parts[2]) || 0;
  return ((h + m / 60 + s / 3600) % 24 + 24) % 24;
}

function colorValueToHex(v: any, fallback: string): string {
  if (!v) return fallback;
  if (typeof v === 'string') {
    const raw = v.startsWith('#') ? v : `#${v}`;
    return raw.length >= 7 ? raw.slice(0, 7) : fallback;
  }
  if (typeof v === 'object') {
    const r = Math.round(Math.min(1, Math.max(0, Number(v.R ?? v.r ?? 0))) * 255);
    const g = Math.round(Math.min(1, Math.max(0, Number(v.G ?? v.g ?? 0))) * 255);
    const b = Math.round(Math.min(1, Math.max(0, Number(v.B ?? v.b ?? 0))) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return fallback;
}

function hexToColor3Value(hex: string, bridge?: LuaBridge) {
  const c = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = (parseInt(c.substring(0, 2), 16) || 0) / 255;
  const g = (parseInt(c.substring(2, 4), 16) || 0) / 255;
  const b = (parseInt(c.substring(4, 6), 16) || 0) / 255;
  if (bridge?.makeColor3) return bridge.makeColor3(r, g, b);
  return hex;
}

export function formatTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

let factory: LuaFactory | null = null;

export function getLuaFactory(): LuaFactory {
  if (!factory) {
    try {
      factory = new LuaFactory(glueUrl);
    } catch {
      factory = new LuaFactory();
    }
  }
  return factory;
}

// --- Lightweight syntax checking (for live error squiggles in the editor) ---
//
// We keep a small, dedicated Lua engine around purely for compiling (not running)
// scripts. wasmoon's `loadString` calls straight into Lua's real parser (`lua_load`),
// so a failure here is exactly the same syntax error the user would hit on Play —
// we just surface it instantly, without executing any code.

export interface LuaSyntaxError {
  line: number;
  message: string;
}

let lintEngine: LuaEngine | null = null;
let lintEnginePromise: Promise<LuaEngine> | null = null;

async function getLintEngine(): Promise<LuaEngine> {
  if (lintEngine) return lintEngine;
  if (!lintEnginePromise) {
    lintEnginePromise = getLuaFactory()
      .createEngine({ openStandardLibs: false, injectObjects: false })
      .then((engine) => {
        lintEngine = engine;
        return engine;
      })
      .catch((err) => {
        lintEnginePromise = null;
        throw err;
      });
  }
  return lintEnginePromise;
}

// Matches wasmoon/Lua's chunk-load error format: `[string "name"]:LINE: message`
const LUA_LOAD_ERROR_PATTERN = /\]:(\d+):\s*(.*)$/s;

// Compiles `code` without running it and returns the first syntax error, or
// null if it compiles cleanly. Safe to call rapidly (e.g. on every keystroke,
// debounced) — the underlying Lua stack is reset after every call.
export async function checkLuaSyntax(code: string): Promise<LuaSyntaxError | null> {
  if (!code || !code.trim()) return null;

  let engine: LuaEngine;
  try {
    engine = await getLintEngine();
  } catch {
    return null; // Linting isn't available (e.g. WASM failed to load) — fail silently.
  }

  try {
    engine.global.loadString(code, 'script');
    return null;
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const firstLine = rawMessage.split('\n')[0];
    const match = LUA_LOAD_ERROR_PATTERN.exec(firstLine);
    if (match) {
      return { line: parseInt(match[1], 10), message: match[2].trim() };
    }
    return { line: 1, message: firstLine.trim() };
  } finally {
    // loadString leaves either the compiled chunk or an error object on the
    // stack; wipe it so repeated lint calls don't leak memory over time.
    try {
      engine.global.setTop(0);
    } catch {
      // Engine may be in a bad state; nothing more we can do here.
    }
  }
}

export function findNodeByName(nodes: TreeNodeData[], name: string): TreeNodeData | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    const found = findNodeByName(node.children, name);
    if (found) return found;
  }
  return null;
}

export function findNodeById(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

// Fire a Roblox-like instance signal such as Touched / TouchEnded by routing it
// through the shared signal hub keyed per instance and event name.
export function fireInstanceSignal(nodeId: string, signalName: string, ...args: any[]): void {
  globalSignalHub.fire(`InstanceSignal:${nodeId}:${signalName}`, ...args);
}

export function findParentNode(
  nodes: TreeNodeData[],
  targetId: string,
  parent: TreeNodeData | null = null
): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return parent;
    }
    if (node.children && node.children.length > 0) {
      const found = findParentNode(node.children, targetId, node);
      if (found) return found;
    }
  }
  return null;
}

export function getAllDescendants(node: TreeNodeData): TreeNodeData[] {
  let list: TreeNodeData[] = [];
  for (const child of node.children || []) {
    list.push(child);
    list = list.concat(getAllDescendants(child));
  }
  return list;
}

export type LuaBridge = {
  makeCFrame: (x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number) => any;
  makeVector3: (x?: number, y?: number, z?: number) => any;
  makeColor3: (r?: number, g?: number, b?: number) => any;
  // Which side of the client/server boundary this bridge (and the Lua VM it
  // belongs to) represents. Used by RemoteEvent/RemoteFunction to enforce
  // real Roblox rules (e.g. FireServer is only callable from a LocalScript).
  side: 'server' | 'client';
};

function extractCFrameData(cf: any): { position: [number, number, number]; rotation: [number, number, number] } {
  if (!cf) return { position: [0, 5, 0], rotation: [0, 0, 0] };

  const x = Number(cf.X ?? cf.x ?? cf.Position?.X ?? 0);
  const y = Number(cf.Y ?? cf.y ?? cf.Position?.Y ?? 0);
  const z = Number(cf.Z ?? cf.z ?? cf.Position?.Z ?? 0);

  let rx = 0;
  let ry = 0;
  let rz = 0;

  if (typeof cf.ToEulerAnglesXYZ === 'function') {
    try {
      const res = cf.ToEulerAnglesXYZ();
      if (Array.isArray(res)) {
        [rx, ry, rz] = res.map(Number);
      }
    } catch {}
  }

  if (rx === 0 && ry === 0 && rz === 0 && (cf.r00 !== undefined || cf.R00 !== undefined)) {
    const r00 = Number(cf.r00 ?? cf.R00 ?? 1);
    const r01 = Number(cf.r01 ?? cf.R01 ?? 0);
    const r02 = Number(cf.r02 ?? cf.R02 ?? 0);
    const r10 = Number(cf.r10 ?? cf.R10 ?? 0);
    const r11 = Number(cf.r11 ?? cf.R11 ?? 1);
    const r12 = Number(cf.r12 ?? cf.R12 ?? 0);
    const r20 = Number(cf.r20 ?? cf.R20 ?? 0);
    const r21 = Number(cf.r21 ?? cf.R21 ?? 0);
    const r22 = Number(cf.r22 ?? cf.R22 ?? 1);

    const sy = Math.max(-1, Math.min(1, r02));
    ry = Math.asin(sy);
    if (Math.abs(Math.cos(ry)) > 1e-6) {
      rx = Math.atan2(-r12, r22);
      rz = Math.atan2(-r01, r00);
    } else {
      rx = Math.atan2(r21, r11);
      rz = 0;
    }
  }

  return { position: [x, y, z], rotation: [rx, ry, rz] };
}

// ---------------------------------------------------------------------------
// RemoteEvent / RemoteFunction bridge
//
// The server and client each run in a completely separate Wasmoon Lua VM
// (separate `LuaEngine`), with separate trees. A RemoteEvent/RemoteFunction
// Instance therefore can't just store its listeners on the tree node like a
// regular property — the two VMs need an out-of-band JS channel to hand Lua
// callbacks and fired arguments across the boundary. `globalRemoteBridge` is
// that channel, keyed by the remote instance's (replicated) node id.
// ---------------------------------------------------------------------------

type RemoteListenerEntry = { callback: (...args: any[]) => any };
type RemoteHandler = ((...args: any[]) => any) | null;

class RemoteBridge {
  private serverListeners: Map<string, RemoteListenerEntry[]> = new Map();
  private clientListeners: Map<string, RemoteListenerEntry[]> = new Map();
  private serverInvokeHandlers: Map<string, (...args: any[]) => any> = new Map();
  private clientInvokeHandlers: Map<string, (...args: any[]) => any> = new Map();

  // Called whenever a Play session starts/stops so stale connections from a
  // previous run never leak into a new one.
  reset() {
    this.serverListeners.clear();
    this.clientListeners.clear();
    this.serverInvokeHandlers.clear();
    this.clientInvokeHandlers.clear();
  }

  connectServerEvent(remoteId: string, callback: (...args: any[]) => any): RemoteListenerEntry {
    const entry: RemoteListenerEntry = { callback };
    const list = this.serverListeners.get(remoteId) || [];
    list.push(entry);
    this.serverListeners.set(remoteId, list);
    return entry;
  }

  connectClientEvent(remoteId: string, callback: (...args: any[]) => any): RemoteListenerEntry {
    const entry: RemoteListenerEntry = { callback };
    const list = this.clientListeners.get(remoteId) || [];
    list.push(entry);
    this.clientListeners.set(remoteId, list);
    return entry;
  }

  disconnectServerEvent(remoteId: string, entry: RemoteListenerEntry) {
    const list = this.serverListeners.get(remoteId);
    if (!list) return;
    const idx = list.indexOf(entry);
    if (idx !== -1) list.splice(idx, 1);
  }

  disconnectClientEvent(remoteId: string, entry: RemoteListenerEntry) {
    const list = this.clientListeners.get(remoteId);
    if (!list) return;
    const idx = list.indexOf(entry);
    if (idx !== -1) list.splice(idx, 1);
  }

  fireServer(remoteId: string, player: any, args: any[]) {
    const list = this.serverListeners.get(remoteId);
    if (!list || list.length === 0) return;
    // Snapshot in case a handler disconnects itself (or another) mid-fire.
    for (const entry of [...list]) {
      entry.callback(player, ...args);
    }
  }

  fireClient(remoteId: string, args: any[]) {
    const list = this.clientListeners.get(remoteId);
    if (!list || list.length === 0) return;
    for (const entry of [...list]) {
      entry.callback(...args);
    }
  }

  setServerInvokeHandler(remoteId: string, fn: RemoteHandler) {
    if (fn) this.serverInvokeHandlers.set(remoteId, fn);
    else this.serverInvokeHandlers.delete(remoteId);
  }

  setClientInvokeHandler(remoteId: string, fn: RemoteHandler) {
    if (fn) this.clientInvokeHandlers.set(remoteId, fn);
    else this.clientInvokeHandlers.delete(remoteId);
  }

  invokeServer(remoteId: string, player: any, args: any[]): any {
    const fn = this.serverInvokeHandlers.get(remoteId);
    if (!fn) throw new Error('RemoteFunction has no OnServerInvoke handler assigned on the server');
    return fn(player, ...args);
  }

  invokeClient(remoteId: string, player: any, args: any[]): any {
    const fn = this.clientInvokeHandlers.get(remoteId);
    if (!fn) throw new Error('RemoteFunction has no OnClientInvoke handler assigned on the client');
    return fn(...args);
  }
}

export const globalRemoteBridge = new RemoteBridge();

// ---------------------------------------------------------------------------
// SignalHub
//
// Generic pub/sub used for the "ambient" engine signals that real Roblox
// fires continuously or on external (DOM) input — RunService.Heartbeat /
// Stepped / RenderStepped, UserInputService.InputBegan / InputEnded /
// InputChanged, and CollectionService's tag-added/removed events. These
// aren't tied to a single Instance the way RemoteEvents are, so they live in
// their own named channels instead of being keyed by node id.
// ---------------------------------------------------------------------------

type SignalListener = (...args: any[]) => any;

class SignalHub {
  private channels: Map<string, SignalListener[]> = new Map();

  reset() {
    this.channels.clear();
  }

  connect(channel: string, fn: SignalListener): SignalListener {
    const list = this.channels.get(channel) || [];
    list.push(fn);
    this.channels.set(channel, list);
    return fn;
  }

  disconnect(channel: string, fn: SignalListener) {
    const list = this.channels.get(channel);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  deleteChannel(channel: string) {
    this.channels.delete(channel);
  }

  fire(channel: string, ...args: any[]) {
    const list = this.channels.get(channel);
    if (!list || list.length === 0) return;
    for (const fn of [...list]) {
      try {
        fn(...args);
      } catch {
        // A listener throwing shouldn't take down the whole engine tick.
      }
    }
  }

  hasListeners(channel: string): boolean {
    const list = this.channels.get(channel);
    return !!list && list.length > 0;
  }
}

export const globalSignalHub = new SignalHub();

// There's no real multiplayer session here — just one implicit local player —
// but Roblox's Remote APIs always pass a Player as the first argument
// (OnServerEvent, OnServerInvoke) or expect one (FireClient, InvokeClient),
// so scripts written against the real API keep working unmodified.
function makeFakePlayer() {
  return { __type: 'Player', Name: 'Player1', DisplayName: 'Player1', UserId: 1, ClassName: 'Player' };
}

type RemoteProxyCtx = {
  getTree: () => TreeNodeData[];
  updateTree: (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => void;
  onLog: (type: LogType, message: string) => void;
  bridge?: LuaBridge;
};

// Values crossing the server<->client boundary arrive as plain JS data
// (Wasmoon auto-marshals Lua tables to JS objects on the way out of a VM).
// A Vector3/CFrame/Color3 built that way has the right fields but none of
// the receiving VM's metatables, so arithmetic/methods on it would fail.
// This walks the value and rebuilds anything recognizable using the
// *receiving* side's own bridge, so it comes out as a fully native value.
function rehydrateRemoteValue(value: any, ctx: RemoteProxyCtx): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => rehydrateRemoteValue(v, ctx));
  }
  if (typeof value === 'object') {
    if (value.__type === 'Vector3' && ctx.bridge?.makeVector3) {
      return ctx.bridge.makeVector3(Number(value.X) || 0, Number(value.Y) || 0, Number(value.Z) || 0);
    }
    if (value.__type === 'Color3' && ctx.bridge?.makeColor3) {
      return ctx.bridge.makeColor3(Number(value.R) || 0, Number(value.G) || 0, Number(value.B) || 0);
    }
    if (value.__type === 'CFrame' && ctx.bridge?.makeCFrame) {
      const { position, rotation } = extractCFrameData(value);
      return ctx.bridge.makeCFrame(position[0], position[1], position[2], rotation[0], rotation[1], rotation[2]);
    }
    if (value.__type === 'Instance' && value.__nodeId) {
      return createInstanceProxy(value.__nodeId, ctx.getTree, ctx.updateTree, ctx.onLog, ctx.bridge);
    }
    // Plain dictionary/array-like table — recurse so nested typed values
    // (e.g. a table holding a Vector3) still get rehydrated correctly.
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = rehydrateRemoteValue(value[key], ctx);
    }
    return out;
  }
  return value;
}

function getDefaultPosition(node: TreeNodeData): [number, number, number] {
  if (node.position) return node.position;
  const name = node.name.toLowerCase();
  if (name === 'baseplate') return [0, -0.5, 0];
  if (name === 'spawnlocation' || node.type === 'spawnlocation') return [0, 0.5, 0];
  return [0, 5, 0];
}

function getDefaultSize(node: TreeNodeData): [number, number, number] {
  if (node.size) return node.size;
  const name = node.name.toLowerCase();
  if (name === 'baseplate') return [512, 1, 512];
  if (name === 'spawnlocation' || node.type === 'spawnlocation') return [12, 1, 12];
  return [4, 4, 4];
}

function makeInstanceVector3(bridge: LuaBridge | undefined, x: number, y: number, z: number): any {
  return {
    __type: 'Vector3',
    X: x,
    Y: y,
    Z: z,
    Lerp: (first: any, second: any, third?: number) => {
      const target = third === undefined ? first : second;
      const alpha = third === undefined ? second : third;
      const t = Number(alpha) || 0;
      const result = [
        x + (Number(target?.X ?? target?.x ?? 0) - x) * t,
        y + (Number(target?.Y ?? target?.y ?? 0) - y) * t,
        z + (Number(target?.Z ?? target?.z ?? 0) - z) * t,
      ];
      return bridge?.makeVector3
        ? bridge.makeVector3(result[0], result[1], result[2])
        : { __type: 'Vector3', X: result[0], Y: result[1], Z: result[2] };
    },
    toString: () => `${x}, ${y}, ${z}`,
  };
}

export function createInstanceProxy(
  nodeId: string,
  getTree: () => TreeNodeData[],
  updateTree: (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => void,
  onLog: (type: LogType, message: string) => void,
  bridge?: LuaBridge
): any {
  const getNode = () => findNodeById(getTree(), nodeId);
  const isLightNode = () => {
    const type = getNode()?.type?.toLowerCase();
    return type === 'pointlight' || type === 'spotlight' || type === 'surfacelight';
  };
  const makeInstanceSignal = (signalName: 'Touched' | 'TouchEnded') => ({
    __type: 'RBXScriptSignal',
    Connect: (fn: any) => {
      if (typeof fn !== 'function') return null;
      const listener = (otherNodeId: string) => {
        const otherInstance = createInstanceProxy(otherNodeId, getTree, updateTree, onLog, bridge);
        fn(otherInstance);
      };
      const channel = `InstanceSignal:${nodeId}:${signalName}`;
      globalSignalHub.connect(channel, listener);
      return {
        __type: 'RBXScriptConnection',
        Connected: true,
        Disconnect: () => globalSignalHub.disconnect(channel, listener),
      };
    },
  });

  const rawInstance = {
    __type: 'Instance',
    __nodeId: nodeId,

    get Touched() {
      return makeInstanceSignal('Touched');
    },
    get TouchEnded() {
      return makeInstanceSignal('TouchEnded');
    },

    get Name() {
      return getNode()?.name || '';
    },
    set Name(newName: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, name: newName } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ClassName() {
      const node = getNode();
      if (!node) return 'Instance';
      if (node.id === 'workspace') return 'Workspace';
      if (node.id === 'lighting') return 'Lighting';
      if (node.type === 'part' || node.type === 'object') return 'Part';
      if (node.type === 'spawnlocation') return 'SpawnLocation';
      if (node.type === 'script') return 'Script';
      if (node.type === 'localscript') return 'LocalScript';
      if (node.type === 'modulescript') return 'ModuleScript';
      if (node.type === 'remoteevent') return 'RemoteEvent';
      if (node.type === 'remotefunction') return 'RemoteFunction';
      if (node.type === 'camera') return 'Camera';
      if (node.type === 'terrain') return 'Terrain';
      if (node.type === 'folder' || node.type === 'folder_script') return 'Folder';
      if (node.type === 'model') return 'Model';
      if (node.type === 'decal') return 'Decal';
      if (node.type === 'texture') return 'Texture';
      if (node.type === 'pointlight') return 'PointLight';
      if (node.type === 'spotlight') return 'SpotLight';
      if (node.type === 'surfacelight') return 'SurfaceLight';
      if (node.type === 'sky') return 'Sky';
      if (node.type === 'atmosphere') return 'Atmosphere';
      if (node.type === 'colorcorrectioneffect') return 'ColorCorrectionEffect';
      if (node.type === 'bloomeffect') return 'BloomEffect';
      if (node.type === 'sunrayseffect') return 'SunRaysEffect';
      if (node.type === 'blureffect') return 'BlurEffect';
      if (node.type === 'depthoffieldeffect') return 'DepthOfFieldEffect';
      return node.name || 'Instance';
    },

    get Velocity() {
      const v = globalPhysicsEngine.getVelocity(nodeId);
      return makeInstanceVector3(bridge, v[0], v[1], v[2]);
    },
    set Velocity(v: any) {
      if (v) {
        const x = Number(v.X ?? v.x ?? 0);
        const y = Number(v.Y ?? v.y ?? 0);
        const z = Number(v.Z ?? v.z ?? 0);
        globalPhysicsEngine.setVelocity(nodeId, [x, y, z]);
      }
    },

    get AssemblyLinearVelocity() {
      return (this as any).Velocity;
    },
    set AssemblyLinearVelocity(v: any) {
      (this as any).Velocity = v;
    },

    get RotVelocity() {
      const w = globalPhysicsEngine.getAngularVelocity(nodeId);
      return makeInstanceVector3(bridge, w[0], w[1], w[2]);
    },
    set RotVelocity(v: any) {
      if (v) {
        const x = Number(v.X ?? v.x ?? 0);
        const y = Number(v.Y ?? v.y ?? 0);
        const z = Number(v.Z ?? v.z ?? 0);
        globalPhysicsEngine.setAngularVelocity(nodeId, [x, y, z]);
      }
    },

    get AssemblyAngularVelocity() {
      return (this as any).RotVelocity;
    },
    set AssemblyAngularVelocity(v: any) {
      (this as any).RotVelocity = v;
    },

    get Gravity() {
      return globalPhysicsEngine.gravity;
    },
    set Gravity(g: number) {
      globalPhysicsEngine.gravity = Number(g) || 0;
    },

    get Position() {
      const node = getNode();
      const p = node ? getDefaultPosition(node) : [0, 0, 0];
      return makeInstanceVector3(bridge, p[0], p[1], p[2]);
    },
    set Position(v: any) {
      if (v) {
        const x = Number(v.X ?? v.x ?? 0);
        const y = Number(v.Y ?? v.y ?? 0);
        const z = Number(v.Z ?? v.z ?? 0);
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, position: [x, y, z] } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },

    get CFrame() {
      const node = getNode();
      const p = node ? getDefaultPosition(node) : [0, 0, 0];
      const r = node?.rotation || [0, 0, 0];
      if (bridge?.makeCFrame) {
        return bridge.makeCFrame(p[0], p[1], p[2], r[0], r[1], r[2]);
      }
      return {
        __type: 'CFrame',
        X: p[0],
        Y: p[1],
        Z: p[2],
        Position: { __type: 'Vector3', X: p[0], Y: p[1], Z: p[2] },
        toString: () => `${p[0]}, ${p[1]}, ${p[2]}, 1, 0, 0, 0, 1, 0, 0, 0, 1`,
      };
    },
    set CFrame(cf: any) {
      if (cf) {
        const { position, rotation } = extractCFrameData(cf);
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) =>
              n.id === nodeId ? { ...n, position, rotation } : { ...n, children: update(n.children) }
            );
          return update(tree);
        });
      }
    },

    get Rotation() {
      const r = getNode()?.rotation || [0, 0, 0];
      return makeInstanceVector3(bridge, r[0], r[1], r[2]);
    },
    set Rotation(v: any) {
      if (v) {
        const x = Number(v.X ?? v.x ?? 0);
        const y = Number(v.Y ?? v.y ?? 0);
        const z = Number(v.Z ?? v.z ?? 0);
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, rotation: [x, y, z] } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },

    get Orientation() {
      const r = getNode()?.rotation || [0, 0, 0];
      const degX = (r[0] * 180) / Math.PI;
      const degY = (r[1] * 180) / Math.PI;
      const degZ = (r[2] * 180) / Math.PI;
      return makeInstanceVector3(bridge, degX, degY, degZ);
    },
    set Orientation(v: any) {
      if (v) {
        const degX = Number(v.X ?? v.x ?? 0);
        const degY = Number(v.Y ?? v.y ?? 0);
        const degZ = Number(v.Z ?? v.z ?? 0);
        const rx = (degX * Math.PI) / 180;
        const ry = (degY * Math.PI) / 180;
        const rz = (degZ * Math.PI) / 180;
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, rotation: [rx, ry, rz] } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },

    get Size() {
      const node = getNode();
      const s = node ? getDefaultSize(node) : [4, 4, 4];
      return makeInstanceVector3(bridge, s[0], s[1], s[2]);
    },
    set Size(v: any) {
      if (v) {
        const x = Number(v.X ?? v.x ?? 4);
        const y = Number(v.Y ?? v.y ?? 4);
        const z = Number(v.Z ?? v.z ?? 4);
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, size: [x, y, z] } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },

    get Color() {
      const c = isLightNode() ? (getNode()?.lightColor || '#ffffff') : (getNode()?.color || '#a3a2a5');
      if (bridge?.makeColor3) {
        const hex = c.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return bridge.makeColor3(r, g, b);
      }
      return c;
    },
    set Color(v: any) {
      if (v) {
        let hex = '#a3a2a5';
        if (typeof v === 'string') {
          hex = v.startsWith('#') ? v : `#${v}`;
        } else if (typeof v === 'object') {
          const r = Math.round(Math.min(1, Math.max(0, Number(v.R ?? v.r ?? 0))) * 255);
          const g = Math.round(Math.min(1, Math.max(0, Number(v.G ?? v.g ?? 0))) * 255);
          const b = Math.round(Math.min(1, Math.max(0, Number(v.B ?? v.b ?? 0))) * 255);
          hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) =>
              n.id === nodeId
                ? (isLightNode() ? { ...n, lightColor: hex } : { ...n, color: hex })
                : { ...n, children: update(n.children) }
            );
          return update(tree);
        });
      }
    },
    get Color3() {
      return (this as any).Color;
    },
    set Color3(v: any) {
      (this as any).Color = v;
    },

    get BrickColor() {
      return { __type: 'BrickColor', toString: () => 'Medium stone grey' };
    },
    set BrickColor(v: any) {
      if (v) {
        let colorHex = '#a3a2a5';
        if (typeof v === 'string') {
          colorHex = v;
        } else if (v.Color) {
          const c = v.Color;
          const r = Math.round(Math.min(1, Math.max(0, Number(c.R ?? 0))) * 255);
          const g = Math.round(Math.min(1, Math.max(0, Number(c.G ?? 0))) * 255);
          const b = Math.round(Math.min(1, Math.max(0, Number(c.B ?? 0))) * 255);
          colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, color: colorHex } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },

    get Transparency() {
      return getNode()?.transparency ?? 0;
    },
    set Transparency(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, transparency: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Anchored() {
      return getNode()?.anchored ?? true;
    },
    set Anchored(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, anchored: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get CanCollide() {
      return getNode()?.canCollide !== false;
    },
    set CanCollide(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, canCollide: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get CanTouch() {
      return getNode()?.canTouch !== false;
    },
    set CanTouch(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, canTouch: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get CanQuery() {
      return getNode()?.canQuery !== false;
    },
    set CanQuery(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, canQuery: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get AudioCanCollide() {
      return getNode()?.audioCanCollide !== false;
    },
    set AudioCanCollide(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, audioCanCollide: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get CollisionGroup() {
      return getNode()?.collisionGroup || 'Default';
    },
    set CollisionGroup(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, collisionGroup: String(v) } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Locked() {
      return !!getNode()?.locked;
    },
    set Locked(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, locked: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Massless() {
      return !!getNode()?.massless;
    },
    set Massless(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, massless: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Mass() {
      const node = getNode();
      const s = node ? getDefaultSize(node) : [4, 4, 4];
      const size = s as [number, number, number];
      const mass = node
        ? computeMass(size, node.shape, node.material, node.massless)
        : computeMass(size, undefined, undefined, undefined);
      return Math.round(mass * 10) / 10;
    },

    get RootPriority() {
      return getNode()?.rootPriority || 0;
    },
    set RootPriority(v: number) {
      const num = parseInt(String(v)) || 0;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, rootPriority: num } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Shape() {
      return getNode()?.shape || 'Block';
    },
    set Shape(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, shape: String(v) } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Material() {
      return getNode()?.material || 'Plastic';
    },
    set Material(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, material: String(v) } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Reflectance() {
      return getNode()?.reflectance ?? 0;
    },
    set Reflectance(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, reflectance: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get CastShadow() {
      return getNode()?.castShadow !== false;
    },
    set CastShadow(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, castShadow: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Archivable() {
      return getNode()?.archivable !== false;
    },
    set Archivable(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, archivable: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Ambient() {
      return hexToColor3Value(getNode()?.ambientColor || LIGHTING_DEFAULTS.ambientColor, bridge);
    },
    set Ambient(v: any) {
      const hex = colorValueToHex(v, LIGHTING_DEFAULTS.ambientColor);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, ambientColor: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get OutdoorAmbient() {
      return hexToColor3Value(getNode()?.outdoorAmbient || LIGHTING_DEFAULTS.outdoorAmbient, bridge);
    },
    set OutdoorAmbient(v: any) {
      const hex = colorValueToHex(v, LIGHTING_DEFAULTS.outdoorAmbient);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, outdoorAmbient: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Brightness() {
      return isLightNode() ? (getNode()?.lightBrightness ?? 1) : (getNode()?.brightness ?? LIGHTING_DEFAULTS.brightness);
    },
    set Brightness(v: number) {
      const val = Math.max(0, Number(v) || 0);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) =>
            n.id === nodeId
              ? (isLightNode() ? { ...n, lightBrightness: val } : { ...n, brightness: val })
              : { ...n, children: update(n.children) }
          );
        return update(tree);
      });
    },

    get ColorShift_Top() {
      return hexToColor3Value(getNode()?.colorShiftTop || LIGHTING_DEFAULTS.colorShiftTop, bridge);
    },
    set ColorShift_Top(v: any) {
      const hex = colorValueToHex(v, LIGHTING_DEFAULTS.colorShiftTop);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, colorShiftTop: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ColorShift_Bottom() {
      return hexToColor3Value(getNode()?.colorShiftBottom || LIGHTING_DEFAULTS.colorShiftBottom, bridge);
    },
    set ColorShift_Bottom(v: any) {
      const hex = colorValueToHex(v, LIGHTING_DEFAULTS.colorShiftBottom);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, colorShiftBottom: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ClockTime() {
      return getNode()?.clockTime ?? LIGHTING_DEFAULTS.clockTime;
    },
    set ClockTime(v: number) {
      const val = ((Number(v) % 24) + 24) % 24;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, clockTime: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get TimeOfDay() {
      return clockTimeToTimeOfDay(getNode()?.clockTime ?? LIGHTING_DEFAULTS.clockTime);
    },
    set TimeOfDay(v: string) {
      const val = timeOfDayToClockTime(String(v));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, clockTime: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get GeographicLatitude() {
      return getNode()?.geographicLatitude ?? LIGHTING_DEFAULTS.geographicLatitude;
    },
    set GeographicLatitude(v: number) {
      const val = Math.max(-90, Math.min(90, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, geographicLatitude: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get FogColor() {
      return hexToColor3Value(getNode()?.fogColor || LIGHTING_DEFAULTS.fogColor, bridge);
    },
    set FogColor(v: any) {
      const hex = colorValueToHex(v, LIGHTING_DEFAULTS.fogColor);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, fogColor: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get FogStart() {
      return getNode()?.fogStart ?? LIGHTING_DEFAULTS.fogStart;
    },
    set FogStart(v: number) {
      const val = Math.max(0, Number(v) || 0);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, fogStart: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get FogEnd() {
      return getNode()?.fogEnd ?? LIGHTING_DEFAULTS.fogEnd;
    },
    set FogEnd(v: number) {
      const val = Math.max(0, Number(v) || 0);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, fogEnd: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ShadowSoftness() {
      return getNode()?.shadowSoftness ?? LIGHTING_DEFAULTS.shadowSoftness;
    },
    set ShadowSoftness(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, shadowSoftness: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get GlobalShadows() {
      return getNode()?.globalShadows !== false;
    },
    set GlobalShadows(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, globalShadows: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ExposureCompensation() {
      return getNode()?.exposureCompensation ?? LIGHTING_DEFAULTS.exposureCompensation;
    },
    set ExposureCompensation(v: number) {
      const val = Math.max(-3, Math.min(3, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, exposureCompensation: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get EnvironmentDiffuseScale() {
      return getNode()?.environmentDiffuseScale ?? LIGHTING_DEFAULTS.environmentDiffuseScale;
    },
    set EnvironmentDiffuseScale(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, environmentDiffuseScale: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get EnvironmentSpecularScale() {
      return getNode()?.environmentSpecularScale ?? LIGHTING_DEFAULTS.environmentSpecularScale;
    },
    set EnvironmentSpecularScale(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, environmentSpecularScale: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get SkyEnabled() {
      return getNode()?.skyEnabled !== false;
    },
    set SkyEnabled(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyEnabled: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get FogEnabled() {
      return getNode()?.fogEnabled !== false;
    },
    set FogEnabled(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, fogEnabled: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get AmbientIntensity() {
      return getNode()?.ambientIntensity ?? LIGHTING_DEFAULTS.ambientIntensity;
    },
    set AmbientIntensity(v: number) {
      const val = Math.max(0, Math.min(2, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, ambientIntensity: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get SunAngle() {
      return getNode()?.sunAngle ?? LIGHTING_DEFAULTS.sunAngle;
    },
    set SunAngle(v: number) {
      const val = Math.max(-50, Math.min(50, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, sunAngle: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Technology() {
      return getNode()?.technology || LIGHTING_DEFAULTS.technology;
    },
    set Technology(v: any) {
      const tech = typeof v === 'object' && v?.Name ? String(v.Name) : String(v || 'ShadowMap');
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, technology: tech } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    SetMinutesAfterMidnight: (minutes: number) => {
      const val = ((Number(minutes) / 60) % 24 + 24) % 24;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, clockTime: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    GetMinutesAfterMidnight: () => {
      const ct = getNode()?.clockTime ?? LIGHTING_DEFAULTS.clockTime;
      return ct * 60;
    },

    GetSunDirection: () => {
      const node = getNode();
      const ct = node?.clockTime ?? LIGHTING_DEFAULTS.clockTime;
      const lat = node?.geographicLatitude ?? LIGHTING_DEFAULTS.geographicLatitude;
      const sa = node?.sunAngle ?? LIGHTING_DEFAULTS.sunAngle;
      const { sunDirection } = calculateCelestialDirections(ct, lat, sa);
      return makeInstanceVector3(bridge, sunDirection[0], sunDirection[1], sunDirection[2]);
    },

    GetMoonDirection: () => {
      const node = getNode();
      const ct = node?.clockTime ?? LIGHTING_DEFAULTS.clockTime;
      const lat = node?.geographicLatitude ?? LIGHTING_DEFAULTS.geographicLatitude;
      const sa = node?.sunAngle ?? LIGHTING_DEFAULTS.sunAngle;
      const { moonDirection } = calculateCelestialDirections(ct, lat, sa);
      return makeInstanceVector3(bridge, moonDirection[0], moonDirection[1], moonDirection[2]);
    },

    // Light Properties (PointLight / SpotLight / SurfaceLight)
    get Range() {
      return getNode()?.range ?? 16;
    },
    set Range(v: number) {
      const val = Math.max(0, Number(v) || 0);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, range: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Shadows() {
      return !!getNode()?.shadows;
    },
    set Shadows(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, shadows: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Angle() {
      return getNode()?.angle ?? 90;
    },
    set Angle(v: number) {
      const val = Math.max(0, Math.min(180, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, angle: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Face() {
      return getNode()?.face || 'Front';
    },
    set Face(v: any) {
      const face = typeof v === 'object' && v?.Name ? String(v.Name) : String(v || 'Front');
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, face } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    // Decal and Texture Properties
    get Texture() {
      return getNode()?.texture || '';
    },
    set Texture(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, texture: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get StudsPerTileU() {
      return getNode()?.studsPerTileU ?? 2;
    },
    set StudsPerTileU(v: number) {
      const val = Number(v) || 2;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, studsPerTileU: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get StudsPerTileV() {
      return getNode()?.studsPerTileV ?? 2;
    },
    set StudsPerTileV(v: number) {
      const val = Number(v) || 2;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, studsPerTileV: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get OffsetStudsU() {
      return getNode()?.offsetStudsU ?? 0;
    },
    set OffsetStudsU(v: number) {
      const val = Number(v) || 0;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, offsetStudsU: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get OffsetStudsV() {
      return getNode()?.offsetStudsV ?? 0;
    },
    set OffsetStudsV(v: number) {
      const val = Number(v) || 0;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, offsetStudsV: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get ZIndex() {
      return getNode()?.zIndex ?? 1;
    },
    set ZIndex(v: number) {
      const val = Number(v) || 1;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, zIndex: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Enabled() {
      return getNode()?.enabled !== false;
    },
    set Enabled(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, enabled: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    // Sky Properties
    get SkyboxBk() { return getNode()?.skyboxBk || ''; },
    set SkyboxBk(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxBk: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SkyboxDn() { return getNode()?.skyboxDn || ''; },
    set SkyboxDn(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxDn: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SkyboxFt() { return getNode()?.skyboxFt || ''; },
    set SkyboxFt(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxFt: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SkyboxLf() { return getNode()?.skyboxLf || ''; },
    set SkyboxLf(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxLf: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SkyboxRt() { return getNode()?.skyboxRt || ''; },
    set SkyboxRt(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxRt: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SkyboxUp() { return getNode()?.skyboxUp || ''; },
    set SkyboxUp(v: string) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, skyboxUp: String(v || '') } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get SunAngularSize() { return getNode()?.sunAngularSize ?? 21; },
    set SunAngularSize(v: number) {
      const val = Math.max(0, Math.min(60, Number(v) || 21));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, sunAngularSize: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get MoonAngularSize() { return getNode()?.moonAngularSize ?? 11; },
    set MoonAngularSize(v: number) {
      const val = Math.max(0, Math.min(60, Number(v) || 11));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, moonAngularSize: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get CelestialBodiesShown() { return getNode()?.celestialBodiesShown !== false; },
    set CelestialBodiesShown(v: boolean) {
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, celestialBodiesShown: !!v } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get StarCount() { return getNode()?.starCount ?? 3000; },
    set StarCount(v: number) {
      const val = Math.max(0, Math.min(10000, Number(v) || 3000));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, starCount: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    // Atmosphere Properties
    get Density() { return getNode()?.density ?? 0.395; },
    set Density(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, density: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Offset() { return getNode()?.offset ?? 0.25; },
    set Offset(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, offset: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Decay() {
      return hexToColor3Value(getNode()?.decay || '#6a5b4f', bridge);
    },
    set Decay(v: any) {
      const hex = colorValueToHex(v, '#6a5b4f');
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, decay: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Glare() { return getNode()?.glare ?? 0; },
    set Glare(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, glare: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Haze() { return getNode()?.haze ?? 0; },
    set Haze(v: number) {
      const val = Math.max(0, Math.min(10, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, haze: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    // Post Processing Properties
    get Contrast() { return getNode()?.contrast ?? 0; },
    set Contrast(v: number) {
      const val = Math.max(-1, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, contrast: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Saturation() { return getNode()?.saturation ?? 0; },
    set Saturation(v: number) {
      const val = Math.max(-1, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, saturation: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get TintColor() {
      return hexToColor3Value(getNode()?.tintColor || '#ffffff', bridge);
    },
    set TintColor(v: any) {
      const hex = colorValueToHex(v, '#ffffff');
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, tintColor: hex } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Intensity() { return getNode()?.intensity ?? 1; },
    set Intensity(v: number) {
      const val = Math.max(0, Number(v) || 0);
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, intensity: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Threshold() { return getNode()?.threshold ?? 2; },
    set Threshold(v: number) {
      const val = Math.max(0, Math.min(4, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, threshold: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },
    get Spread() { return getNode()?.spread ?? 0.1; },
    set Spread(v: number) {
      const val = Math.max(0, Math.min(1, Number(v) || 0));
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, spread: val } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    get Parent() {
      const parent = findParentNode(getTree(), nodeId);
      return parent ? createInstanceProxy(parent.id, getTree, updateTree, onLog, bridge) : null;
    },
    set Parent(newParent: any) {
      if (newParent === null || newParent === undefined) {
        updateTree((tree) => {
          const remove = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.filter((n) => n.id !== nodeId).map((n) => ({ ...n, children: remove(n.children) }));
          return remove(tree);
        });
      } else {
        const targetParentId = newParent.__nodeId || (newParent.Name === 'Workspace' ? 'workspace' : null);
        if (targetParentId) {
          updateTree((tree) => {
            let targetNode: TreeNodeData | null = null;
            const remove = (nodes: TreeNodeData[]): TreeNodeData[] =>
              nodes
                .filter((n) => {
                  if (n.id === nodeId) {
                    targetNode = n;
                    return false;
                  }
                  return true;
                })
                .map((n) => ({ ...n, children: remove(n.children) }));

            const treeWithoutNode = remove(tree);
            if (!targetNode) return tree;

            const insert = (nodes: TreeNodeData[]): TreeNodeData[] =>
              nodes.map((n) => {
                if (n.id === targetParentId) {
                  return { ...n, children: [...n.children, targetNode!], expanded: true };
                }
                return { ...n, children: insert(n.children) };
              });
            return insert(treeWithoutNode);
          });
        }
      }
    },

    FindFirstChild: (name: string, recursive = false) => {
      const node = getNode();
      if (!node) return null;
      if (recursive) {
        const found = findNodeByName(node.children, name);
        return found ? createInstanceProxy(found.id, getTree, updateTree, onLog, bridge) : null;
      }
      const child = node.children.find((c) => c.name === name);
      return child ? createInstanceProxy(child.id, getTree, updateTree, onLog, bridge) : null;
    },

    FindFirstChildWhichIsA: (className: string, recursive = false) => {
      const node = getNode();
      if (!node) return null;
      const lower = className.toLowerCase();
      const check = (n: TreeNodeData) =>
        n.type.toLowerCase() === lower || (n.type === 'object' && lower === 'part') || n.name.toLowerCase() === lower;

      if (recursive) {
        const all = getAllDescendants(node);
        const match = all.find(check);
        return match ? createInstanceProxy(match.id, getTree, updateTree, onLog, bridge) : null;
      }
      const child = node.children.find(check);
      return child ? createInstanceProxy(child.id, getTree, updateTree, onLog, bridge) : null;
    },

    FindFirstChildOfClass: (className: string) => {
      const node = getNode();
      if (!node) return null;
      const lower = className.toLowerCase();
      const child = node.children.find(
        (c) => c.type.toLowerCase() === lower || (c.type === 'object' && lower === 'part')
      );
      return child ? createInstanceProxy(child.id, getTree, updateTree, onLog, bridge) : null;
    },

    WaitForChild: (name: string) => {
      const node = getNode();
      const child = node?.children.find((c) => c.name === name);
      return child ? createInstanceProxy(child.id, getTree, updateTree, onLog, bridge) : null;
    },

    GetChildren: () => {
      const node = getNode();
      return (node?.children || []).map((c) => createInstanceProxy(c.id, getTree, updateTree, onLog, bridge));
    },

    GetDescendants: () => {
      const node = getNode();
      if (!node) return [];
      return getAllDescendants(node).map((c) => createInstanceProxy(c.id, getTree, updateTree, onLog, bridge));
    },

    get PrimaryPart() {
      const node = getNode();
      if (!node) return null;
      if (node.primaryPartId) {
        return createInstanceProxy(node.primaryPartId, getTree, updateTree, onLog, bridge);
      }
      const firstPart = (node.children || []).find((c) => c.type === 'part' || c.type === 'object');
      if (firstPart) {
        return createInstanceProxy(firstPart.id, getTree, updateTree, onLog, bridge);
      }
      return null;
    },
    set PrimaryPart(part: any) {
      const partId = part?.__nodeId || null;
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, primaryPartId: partId } : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    SetPrimaryPartCFrame: (cf: any) => {
      const node = getNode();
      if (!node || !cf) return;
      const { position, rotation } = extractCFrameData(cf);
      const primaryPart = (node.primaryPartId ? findNodeById([node], node.primaryPartId) : null) ||
        (node.children || []).find((c) => c.type === 'part' || c.type === 'object');
      if (primaryPart) {
        const curPos = primaryPart.position || [0, 5, 0];
        const dx = position[0] - curPos[0];
        const dy = position[1] - curPos[1];
        const dz = position[2] - curPos[2];
        const shiftPart = (n: TreeNodeData): TreeNodeData => {
          const updated = { ...n };
          if (n.id === primaryPart.id) {
            updated.position = position;
            updated.rotation = rotation;
          } else if (n.position) {
            updated.position = [n.position[0] + dx, n.position[1] + dy, n.position[2] + dz];
          }
          updated.children = (updated.children || []).map(shiftPart);
          return updated;
        };
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? shiftPart(n) : { ...n, children: update(n.children) }));
          return update(tree);
        });
      } else {
        updateTree((tree) => {
          const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => (n.id === nodeId ? { ...n, position, rotation } : { ...n, children: update(n.children) }));
          return update(tree);
        });
      }
    },
    GetPrimaryPartCFrame: () => {
      const node = getNode();
      if (!node) return null;
      const primaryPart = (node.primaryPartId ? findNodeById([node], node.primaryPartId) : null) ||
        (node.children || []).find((c) => c.type === 'part' || c.type === 'object');
      if (primaryPart && bridge?.makeCFrame) {
        const p = primaryPart.position || [0, 5, 0];
        const r = primaryPart.rotation || [0, 0, 0];
        return bridge.makeCFrame(p[0], p[1], p[2], r[0], r[1], r[2]);
      }
      const p = node.position || [0, 5, 0];
      const r = node.rotation || [0, 0, 0];
      if (bridge?.makeCFrame) {
        return bridge.makeCFrame(p[0], p[1], p[2], r[0], r[1], r[2]);
      }
      return null;
    },
    PivotTo: (cf: any) => {
      (rawInstance as any).SetPrimaryPartCFrame(cf);
    },
    GetPivot: () => {
      return (rawInstance as any).GetPrimaryPartCFrame();
    },
    MoveTo: (targetPos: any) => {
      if (!targetPos) return;
      const x = Number(targetPos.X ?? targetPos.x ?? 0);
      const y = Number(targetPos.Y ?? targetPos.y ?? 0);
      const z = Number(targetPos.Z ?? targetPos.z ?? 0);
      const node = getNode();
      if (!node) return;
      const primaryPart = (node.primaryPartId ? findNodeById([node], node.primaryPartId) : null) ||
        (node.children || []).find((c) => c.type === 'part' || c.type === 'object');
      const curPos = primaryPart?.position || node.position || [0, 5, 0];
      const dx = x - curPos[0];
      const dy = y - curPos[1];
      const dz = z - curPos[2];
      const shiftParts = (n: TreeNodeData): TreeNodeData => {
        const updated = { ...n };
        if (updated.position) {
          updated.position = [updated.position[0] + dx, updated.position[1] + dy, updated.position[2] + dz];
        }
        updated.children = (updated.children || []).map(shiftParts);
        return updated;
      };
      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? shiftParts(n) : { ...n, children: update(n.children) }));
        return update(tree);
      });
    },

    IsA: (className: string) => {
      const node = getNode();
      if (!node) return false;
      if (className === 'Instance') return true;
      const lower = className.toLowerCase();
      if (lower === 'model' && node.type.toLowerCase() === 'model') return true;
      if (lower === 'folder' && (node.type.toLowerCase() === 'folder' || node.type.toLowerCase() === 'folder_script')) return true;
      if (lower === 'decal' && (node.type.toLowerCase() === 'decal' || node.type.toLowerCase() === 'texture')) return true;
      if (lower === 'texture' && node.type.toLowerCase() === 'texture') return true;
      return (
        node.type.toLowerCase() === lower ||
        (node.type === 'object' && lower === 'part') ||
        node.name.toLowerCase() === lower
      );
    },

    Destroy: () => {
      updateTree((tree) => {
        const remove = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.filter((n) => n.id !== nodeId).map((n) => ({ ...n, children: remove(n.children) }));
        return remove(tree);
      });
    },

    ClearAllChildren: () => {
      updateTree((tree) => {
        const clear = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => (n.id === nodeId ? { ...n, children: [] } : { ...n, children: clear(n.children) }));
        return clear(tree);
      });
    },

    Clone: () => {
      const node = getNode();
      if (!node) return null;
      const newId = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const deepClone = (n: TreeNodeData, id: string): TreeNodeData => ({
        ...n,
        id,
        name: n.name + '_clone',
        children: n.children.map((c) => deepClone(c, `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)),
      });

      const cloned = deepClone(node, newId);
      const parent = findParentNode(getTree(), nodeId);
      const parentId = parent?.id || 'workspace';

      updateTree((tree) => {
        const update = (nodes: TreeNodeData[]): TreeNodeData[] =>
          nodes.map((n) => {
            if (n.id === parentId) return { ...n, children: [...n.children, cloned] };
            return { ...n, children: update(n.children) };
          });
        return update(tree);
      });
      return createInstanceProxy(newId, getTree, updateTree, onLog, bridge);
    },

    // ---- RemoteEvent -----------------------------------------------------
    FireServer: (...args: any[]) => {
      if (bridge?.side !== 'client') {
        throw new Error(`FireServer can only be called from a LocalScript (on "${getNode()?.name || nodeId}")`);
      }
      globalRemoteBridge.fireServer(nodeId, makeFakePlayer(), args);
    },

    FireClient: (_player: any, ...args: any[]) => {
      if (bridge?.side !== 'server') {
        throw new Error(`FireClient can only be called from a Script (on "${getNode()?.name || nodeId}")`);
      }
      // Single implicit client — every FireClient call reaches it, same as
      // FireAllClients would in this simulation.
      globalRemoteBridge.fireClient(nodeId, args);
    },

    FireAllClients: (...args: any[]) => {
      if (bridge?.side !== 'server') {
        throw new Error(`FireAllClients can only be called from a Script (on "${getNode()?.name || nodeId}")`);
      }
      globalRemoteBridge.fireClient(nodeId, args);
    },

    get OnServerEvent() {
      const signal = {
        __type: 'RBXScriptSignal',
        Connect: (fn: any) => {
          if (typeof fn !== 'function') return null;
          const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
          const entry = globalRemoteBridge.connectServerEvent(nodeId, (player: any, ...args: any[]) => {
            const hydratedArgs = args.map((a) => rehydrateRemoteValue(a, ctx));
            return fn(player, ...hydratedArgs);
          });
          return {
            __type: 'RBXScriptConnection',
            Connected: true,
            Disconnect: () => globalRemoteBridge.disconnectServerEvent(nodeId, entry),
          };
        },
      };
      return signal;
    },

    get OnClientEvent() {
      const signal = {
        __type: 'RBXScriptSignal',
        Connect: (fn: any) => {
          if (typeof fn !== 'function') return null;
          const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
          const entry = globalRemoteBridge.connectClientEvent(nodeId, (...args: any[]) => {
            const hydratedArgs = args.map((a) => rehydrateRemoteValue(a, ctx));
            return fn(...hydratedArgs);
          });
          return {
            __type: 'RBXScriptConnection',
            Connected: true,
            Disconnect: () => globalRemoteBridge.disconnectClientEvent(nodeId, entry),
          };
        },
      };
      return signal;
    },

    // ---- RemoteFunction ----------------------------------------------------
    InvokeServer: (...args: any[]) => {
      if (bridge?.side !== 'client') {
        throw new Error(`InvokeServer can only be called from a LocalScript (on "${getNode()?.name || nodeId}")`);
      }
      const result = globalRemoteBridge.invokeServer(nodeId, makeFakePlayer(), args);
      const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
      return rehydrateRemoteValue(result, ctx);
    },

    InvokeClient: (player: any, ...args: any[]) => {
      if (bridge?.side !== 'server') {
        throw new Error(`InvokeClient can only be called from a Script (on "${getNode()?.name || nodeId}")`);
      }
      const result = globalRemoteBridge.invokeClient(nodeId, player, args);
      const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
      return rehydrateRemoteValue(result, ctx);
    },

    get OnServerInvoke() {
      return undefined;
    },
    set OnServerInvoke(fn: any) {
      if (typeof fn !== 'function') {
        globalRemoteBridge.setServerInvokeHandler(nodeId, null);
        return;
      }
      const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
      globalRemoteBridge.setServerInvokeHandler(nodeId, (player: any, ...args: any[]) => {
        const hydratedArgs = args.map((a) => rehydrateRemoteValue(a, ctx));
        return fn(player, ...hydratedArgs);
      });
    },

    get OnClientInvoke() {
      return undefined;
    },
    set OnClientInvoke(fn: any) {
      if (typeof fn !== 'function') {
        globalRemoteBridge.setClientInvokeHandler(nodeId, null);
        return;
      }
      const ctx: RemoteProxyCtx = { getTree, updateTree, onLog, bridge };
      globalRemoteBridge.setClientInvokeHandler(nodeId, (...args: any[]) => {
        const hydratedArgs = args.map((a) => rehydrateRemoteValue(a, ctx));
        return fn(...hydratedArgs);
      });
    },

    toString: () => getNode()?.name || 'Instance',
  };

  // Wasmoon can inject plain objects returned from Lua callbacks reliably,
  // but proxy-backed remote instances can turn callable members into js_null.
  // Remote APIs do not need dynamic child lookup, so expose their raw object.
  const node = getNode();
  if (node?.type === 'remoteevent' || node?.type === 'remotefunction') {
    return rawInstance;
  }

  return new Proxy(rawInstance, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return (target as any)[prop];
      if (prop in target) {
        const val = (target as any)[prop];
        if (typeof val === 'function') {
          return val.bind(target);
        }
        return val;
      }
      const node = getNode();
      if (node && node.children) {
        const child = node.children.find((c) => c.name === String(prop));
        if (child) {
          return createInstanceProxy(child.id, getTree, updateTree, onLog, bridge);
        }
      }
      return undefined;
    },
    set(target, prop, value) {
      if (prop in target) {
        (target as any)[prop] = value;
        return true;
      }
      return false;
    },
  });
}

// Builds an object with the same shape Wasmoon-facing Lua code already
// expects from a Roblox signal (see OnServerEvent/OnClientEvent above):
// { Connect(fn) -> connection, Once(fn) -> connection }.
//
// There's deliberately no working `Wait` here. coroutine.yield can only
// suspend a Lua coroutine when the yield happens from Lua bytecode with no
// intervening JS call frame — and *any* value that has crossed the JS/Lua
// boundary (e.g. returned from a JS getter or JS function) has its methods
// re-marshalled such that calling them re-enters JS, making a yield inside
// them fail with "attempt to yield across a C-call boundary". This holds
// even if that method's *own* body is genuine Lua bytecode obtained via
// `engine.global.get`, once it's stored as a field on a JS-originated table.
//
// So a real Wait() has to be built entirely on the Lua side. Services that
// expose waitable signals (RunService, UserInputService, CollectionService)
// mark those field names in `__signalNames`, and `wrapServiceForLua` (used
// by GetService, see createGameProxy) wires each one through
// `__WRAP_RBX_SIGNAL`/`__WRAP_SERVICE`, defined once in Lua in `start()`,
// which adds a genuine Lua Wait() via `coroutine.yield("RBXWAIT", channel)`.
// __STEP resumes it (see the "RBXWAIT" branch) once `channel` fires via
// __RBX_MARK_FIRED.
function makeHubSignal(channel: string): any {
  return {
    __type: 'RBXScriptSignal',
    __hubChannel: channel,
    Connect: (fn: any) => {
      if (typeof fn !== 'function') return null;
      const listener = (...args: any[]) => fn(...args);
      globalSignalHub.connect(channel, listener);
      return {
        __type: 'RBXScriptConnection',
        Connected: true,
        Disconnect: () => globalSignalHub.disconnect(channel, listener),
      };
    },
    Once: (fn: any) => {
      if (typeof fn !== 'function') return null;
      const listener = (...args: any[]) => {
        globalSignalHub.disconnect(channel, listener);
        fn(...args);
      };
      globalSignalHub.connect(channel, listener);
      return {
        __type: 'RBXScriptConnection',
        Connected: true,
        Disconnect: () => globalSignalHub.disconnect(channel, listener),
      };
    },
  };
}

function makeSimpleSignal(): {
  signal: any;
  fire: (...args: any[]) => void;
} {
  const listeners: Array<(...args: any[]) => any> = [];
  const signal = {
    __type: 'RBXScriptSignal',
    Connect: (callback: any) => {
      if (typeof callback !== 'function') return null;
      listeners.push(callback);
      return {
        __type: 'RBXScriptConnection',
        Connected: true,
        Disconnect: () => {
          const index = listeners.indexOf(callback);
          if (index !== -1) listeners.splice(index, 1);
        },
      };
    },
    Once: (callback: any) => {
      if (typeof callback !== 'function') return null;
      const wrapped = (...args: any[]) => {
        const index = listeners.indexOf(wrapped);
        if (index !== -1) listeners.splice(index, 1);
        callback(...args);
      };
      listeners.push(wrapped);
      return {
        __type: 'RBXScriptConnection',
        Connected: true,
        Disconnect: () => {
          const index = listeners.indexOf(wrapped);
          if (index !== -1) listeners.splice(index, 1);
        },
      };
    },
  };
  return {
    signal,
    fire: (...args: any[]) => listeners.slice().forEach((l) => l(...args)),
  };
}

// Builds the fixed set of "engine" services that don't correspond to a tree
// node — RunService, UserInputService, TweenService, Debris, etc. Built once
// per Play session (memoized by createGameProxy) so repeated GetService()
// calls return the identical table, matching Roblox (and so state like
// CollectionService tags or Debris timers isn't lost between calls).
function buildEngineServices(
  getTree: () => TreeNodeData[],
  updateTree: (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => void,
  onLog: (type: LogType, message: string) => void,
  bridge: LuaBridge | undefined,
  workspaceProxy: any
): Record<string, any> {
  const services: Record<string, any> = {};

  // ---- TweenService --------------------------------------------------
  services.tweenservice = {
    __type: 'TweenService',
    Name: 'TweenService',
    ClassName: 'TweenService',
    __objectMethods: ['Create'],
    Create: (instanceArg: any, info: any, goals: Record<string, any>) => {
      // Lua now sends the target's nodeId (a plain string) instead of the
      // wrapped instance table, because that table would otherwise cross
      // the Lua->JS boundary as an empty, disconnected object (see
      // __WRAP_SERVICE's objectMethods branch). Rebuild a real, live
      // instance proxy from it so property reads/writes below actually
      // reach the node tree instead of a throwaway object.
      const nodeId = typeof instanceArg === 'string' ? instanceArg : instanceArg?.__nodeId;
      const instance = nodeId
        ? createInstanceProxy(nodeId, getTree, updateTree, onLog, bridge)
        : instanceArg;
      let completed = false;
      let started = false;
      let timer: ReturnType<typeof setInterval> | null = null;
      const { signal, fire } = makeSimpleSignal();
      const duration = Math.max(0, Number(info?.Time) || 0);
      const starts = new Map<string, any>();
      const interpolate = (start: any, target: any, alpha: number) => {
        if (typeof start === 'number' && typeof target === 'number') {
          return start + (target - start) * alpha;
        }
        if (start && target && start.__type === 'Vector3' && target.__type === 'Vector3') {
          return bridge?.makeVector3(
            start.X + (target.X - start.X) * alpha,
            start.Y + (target.Y - start.Y) * alpha,
            start.Z + (target.Z - start.Z) * alpha
          ) || makeInstanceVector3(bridge,
            start.X + (target.X - start.X) * alpha,
            start.Y + (target.Y - start.Y) * alpha,
            start.Z + (target.Z - start.Z) * alpha
          );
        }
        return alpha >= 1 ? target : start;
      };
      return {
        __type: 'Tween',
        __getCompletedState: () => completed,
        Play: () => {
          if (started) return;
          started = true;
          Object.keys(goals || {}).forEach((property) => {
            starts.set(property, instance[property]);
          });
          const startedAt = Date.now();
          const step = () => {
            const alpha = duration === 0 ? 1 : Math.min(1, (Date.now() - startedAt) / (duration * 1000));
            Object.entries(goals || {}).forEach(([property, value]) => {
              instance[property] = interpolate(starts.get(property), value, alpha);
            });
            if (alpha >= 1) {
              if (timer) clearInterval(timer);
              timer = null;
              completed = true;
              fire('Completed');
            }
          };
          step();
          if (!completed) {
            timer = setInterval(step, 16);
          }
        },
        Cancel: () => {
          if (timer) clearInterval(timer);
          timer = null;
          completed = true;
        },
        Pause: () => {},
        get Completed() {
          return signal;
        },
      };
    },
  };

  // ---- RunService ------------------------------------------------------
  // Heartbeat/Stepped/RenderStepped are fired every tick by LuaRuntime.run
  // Loop via __RBX_MARK_FIRED (for :Wait()) and globalSignalHub.fire (for
  // :Connect()) — see the "RBXWAIT" handling in __STEP. IsServer/IsClient
  // reflect which VM (server script vs. LocalScript) this bridge belongs to.
  const renderStepListeners = new Map<string, (...args: any[]) => any>();
  services.runservice = {
    __type: 'RunService',
    Name: 'RunService',
    ClassName: 'RunService',
    // Consumed by the Lua-side __WRAP_SERVICE helper (see createGameProxy):
    // any field name listed here is fetched via __getRawSignal instead of
    // plain property access, and wrapped with a real Wait(). Plain getters
    // like `get Heartbeat()` still work for :Connect()-only usage, but a raw
    // signal must come from a method call (not a getter) to stay eligible
    // for the Lua-side wrap — see the comment on makeHubSignal.
    __signalNames: ['Heartbeat', 'Stepped', 'RenderStepped'],
    __getRawSignal: (name: string) => makeHubSignal(name),
    IsServer: () => bridge?.side !== 'client',
    IsClient: () => bridge?.side === 'client',
    IsStudio: () => true,
    IsRunning: () => true,
    IsRunMode: () => false,
    BindToRenderStep: (name: string, _priority: number, fn: any) => {
      if (typeof fn !== 'function') return;
      const listener = (dt: number) => fn(dt);
      renderStepListeners.set(name, listener);
      globalSignalHub.connect('RenderStepped', listener);
    },
    UnbindFromRenderStep: (name: string) => {
      const listener = renderStepListeners.get(name);
      if (listener) {
        globalSignalHub.disconnect('RenderStepped', listener);
        renderStepListeners.delete(name);
      }
    },
  };

  // ---- UserInputService --------------------------------------------------
  // Backed by real DOM listeners when a `document` is available (browser),
  // so InputBegan/InputEnded actually reflect keyboard/mouse activity. In a
  // non-browser context (SSR, tests) the service still exists with working
  // Connect/Wait plumbing, it just never fires on its own.
  const pressedKeys = new Set<string>();
  const KEY_TO_KEYCODE: Record<string, string> = {
    ' ': 'Space', Spacebar: 'Space',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Escape: 'Escape', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Shift: 'LeftShift', Control: 'LeftControl', Alt: 'LeftAlt',
  };
  const toKeyCode = (key: string) => {
    if (KEY_TO_KEYCODE[key]) return KEY_TO_KEYCODE[key];
    if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
    if (/^[0-9]$/.test(key)) return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][Number(key)];
    if (/^F\d{1,2}$/.test(key)) return key;
    return 'Unknown';
  };
  const makeInputObject = (type: string, keyCodeName: string, state: string) => ({
    __type: 'InputObject',
    UserInputType: type,
    UserInputState: state,
    KeyCode: { __type: 'EnumItem', Name: keyCodeName, Value: 0 },
    Position: { __type: 'Vector3', X: 0, Y: 0, Z: 0 },
    Delta: { __type: 'Vector3', X: 0, Y: 0, Z: 0 },
  });

  let uisAttached = false;
  const attachUisListeners = () => {
    if (uisAttached || typeof document === 'undefined') return;
    uisAttached = true;
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      const code = toKeyCode(e.key);
      if (pressedKeys.has(code)) return; // ignore OS key-repeat, like Roblox
      pressedKeys.add(code);
      const input = makeInputObject('Keyboard', code, 'Begin');
      globalSignalHub.fire('InputBegan', input, false);
    });
    document.addEventListener('keyup', (e: KeyboardEvent) => {
      const code = toKeyCode(e.key);
      pressedKeys.delete(code);
      const input = makeInputObject('Keyboard', code, 'End');
      globalSignalHub.fire('InputEnded', input, false);
    });
    document.addEventListener('mousedown', (e: MouseEvent) => {
      const type = e.button === 2 ? 'MouseButton2' : e.button === 1 ? 'MouseButton3' : 'MouseButton1';
      globalSignalHub.fire('InputBegan', makeInputObject(type, 'Unknown', 'Begin'), false);
    });
    document.addEventListener('mouseup', (e: MouseEvent) => {
      const type = e.button === 2 ? 'MouseButton2' : e.button === 1 ? 'MouseButton3' : 'MouseButton1';
      globalSignalHub.fire('InputEnded', makeInputObject(type, 'Unknown', 'End'), false);
    });
  };

  services.userinputservice = {
    __type: 'UserInputService',
    Name: 'UserInputService',
    ClassName: 'UserInputService',
    __signalNames: ['InputBegan', 'InputEnded', 'InputChanged'],
    __getRawSignal: (name: string) => { attachUisListeners(); return makeHubSignal(name); },
    IsKeyDown: (keyCodeOrEnum: any) => {
      const name = typeof keyCodeOrEnum === 'string' ? keyCodeOrEnum : keyCodeOrEnum?.Name;
      return pressedKeys.has(name);
    },
    GetMouseLocation: () => ({ __type: 'Vector3', X: 0, Y: 0, Z: 0 }),
    IsMouseButtonPressed: () => false,
    GetLastInputType: () => 'Keyboard',
    TouchEnabled: false,
    KeyboardEnabled: true,
    MouseEnabled: true,
    GamepadEnabled: false,
  };

  // ---- Debris --------------------------------------------------------
  services.debris = {
    __type: 'Debris',
    Name: 'Debris',
    ClassName: 'Debris',
    AddItem: (instance: any, lifetime = 0) => {
      const ms = Math.max(0, (Number(lifetime) || 0) * 1000);
      setTimeout(() => {
        try {
          instance?.Destroy?.();
        } catch {
          /* instance may already be gone */
        }
      }, ms);
    },
  };

  // ---- CollectionService -----------------------------------------------
  const tagMap = new Map<string, Set<string>>(); // tag -> set of nodeIds
  services.collectionservice = {
    __type: 'CollectionService',
    Name: 'CollectionService',
    ClassName: 'CollectionService',
    AddTag: (instance: any, tag: string) => {
      const nodeId = instance?.__nodeId;
      if (!nodeId) return;
      if (!tagMap.has(tag)) tagMap.set(tag, new Set());
      const set = tagMap.get(tag)!;
      if (!set.has(nodeId)) {
        set.add(nodeId);
        globalSignalHub.fire(`CS:Added:${tag}`, instance);
      }
    },
    RemoveTag: (instance: any, tag: string) => {
      const nodeId = instance?.__nodeId;
      if (!nodeId) return;
      const set = tagMap.get(tag);
      if (set?.has(nodeId)) {
        set.delete(nodeId);
        globalSignalHub.fire(`CS:Removed:${tag}`, instance);
      }
    },
    HasTag: (instance: any, tag: string) => {
      const nodeId = instance?.__nodeId;
      return !!nodeId && !!tagMap.get(tag)?.has(nodeId);
    },
    GetTagged: (tag: string) => {
      const set = tagMap.get(tag);
      if (!set) return [];
      return [...set].map((id) => createInstanceProxy(id, getTree, updateTree, onLog, bridge));
    },
    GetInstanceAddedSignal: (tag: string) => makeHubSignal(`CS:Added:${tag}`),
    GetInstanceRemovedSignal: (tag: string) => makeHubSignal(`CS:Removed:${tag}`),
    // Consumed by the Lua-side __WRAP_SERVICE helper: return values of these
    // methods are raw (un-waitable) signals and need the same Wait()
    // treatment as __signalNames fields, but since they take an argument
    // (the tag) they must be wrapped after the call rather than in place of
    // a field lookup.
    __signalMethods: ['GetInstanceAddedSignal', 'GetInstanceRemovedSignal'],
  };

  // ---- HttpService -------------------------------------------------------
  // Real HTTP requests aren't available in this sandboxed VM (no network
  // access to arbitrary hosts); JSON helpers work fully since they're pure.
  services.httpservice = {
    __type: 'HttpService',
    Name: 'HttpService',
    ClassName: 'HttpService',
    JSONEncode: (value: any) => JSON.stringify(value),
    JSONDecode: (text: string) => JSON.parse(text),
    GenerateGUID: (wrapInCurlyBraces = true) => {
      const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      return wrapInCurlyBraces ? `{${guid.toUpperCase()}}` : guid.toUpperCase();
    },
    RequestAsync: () => {
      throw new Error('HttpService.RequestAsync: external HTTP requests are not available in this simulation');
    },
    GetAsync: () => {
      throw new Error('HttpService:GetAsync is not available in this simulation (no external network access)');
    },
    PostAsync: () => {
      throw new Error('HttpService:PostAsync is not available in this simulation (no external network access)');
    },
    HttpEnabled: true,
  };

  // ---- PathfindingService -------------------------------------------------
  // Provides a straight-line path (start -> goal) rather than real
  // navmesh-based pathfinding, so scripts calling :CreatePath /
  // ComputeAsync / GetWaypoints get a usable, well-shaped result without a
  // full navigation-mesh implementation.
  services.pathfindingservice = {
    __type: 'PathfindingService',
    Name: 'PathfindingService',
    ClassName: 'PathfindingService',
    CreatePath: (_agentParams?: any) => {
      let waypoints: any[] = [];
      let status = 'Success';
      // This straight-line approximation never detects obstacles, so
      // `Blocked` is exposed for API compatibility (scripts can :Connect()
      // to it without erroring) but `fire` is intentionally never called —
      // there's no occlusion model to trigger it against.
      const { signal: blockedSignal } = makeSimpleSignal();
      return {
        __type: 'Path',
        Status: status,
        ComputeAsync: (start: any, goal: any) => {
          const sx = Number(start?.X ?? 0), sy = Number(start?.Y ?? 0), sz = Number(start?.Z ?? 0);
          const gx = Number(goal?.X ?? 0), gy = Number(goal?.Y ?? 0), gz = Number(goal?.Z ?? 0);
          const steps = 4;
          waypoints = Array.from({ length: steps + 1 }, (_, i) => {
            const t = i / steps;
            const pos = bridge?.makeVector3
              ? bridge.makeVector3(sx + (gx - sx) * t, sy + (gy - sy) * t, sz + (gz - sz) * t)
              : { __type: 'Vector3', X: sx + (gx - sx) * t, Y: sy + (gy - sy) * t, Z: sz + (gz - sz) * t };
            return {
              __type: 'PathWaypoint',
              Position: pos,
              Action: i === 0 ? 'Start' : i === steps ? 'Finish' : 'Walk',
            };
          });
          status = 'Success';
        },
        GetWaypoints: () => waypoints,
        get Blocked() { return blockedSignal; },
        CheckOcclusionAsync: () => {},
      };
    },
  };

  // ---- ContextActionService -----------------------------------------------
  const boundActions = new Map<string, { onBegan: any; onEnded: any }>();
  services.contextactionservice = {
    __type: 'ContextActionService',
    Name: 'ContextActionService',
    ClassName: 'ContextActionService',
    BindAction: (actionName: string, fn: any, _touchButton: boolean) => {
      // Unbind any previous action registered under this name first, so
      // re-binding (common when scripts rebind on state changes) doesn't
      // stack up duplicate listeners.
      const existing = boundActions.get(actionName);
      if (existing) {
        globalSignalHub.disconnect('InputBegan', existing.onBegan);
        globalSignalHub.disconnect('InputEnded', existing.onEnded);
      }
      const onBegan = (input: any) => {
        if (typeof fn === 'function') fn(actionName, 'Begin', input);
      };
      const onEnded = (input: any) => {
        if (typeof fn === 'function') fn(actionName, 'End', input);
      };
      boundActions.set(actionName, { onBegan, onEnded });
      globalSignalHub.connect('InputBegan', onBegan);
      globalSignalHub.connect('InputEnded', onEnded);
    },
    UnbindAction: (actionName: string) => {
      const existing = boundActions.get(actionName);
      if (existing) {
        globalSignalHub.disconnect('InputBegan', existing.onBegan);
        globalSignalHub.disconnect('InputEnded', existing.onEnded);
        boundActions.delete(actionName);
      }
    },
    GetBoundActionInfo: () => ({}),
    SetTitle: () => {},
    SetImage: () => {},
  };

  // ---- TeleportService -----------------------------------------------
  // No real multi-server/multi-place infrastructure exists here, so this
  // reports success without actually navigating away, which keeps scripts
  // that call it (often just to log intent) from erroring out.
  services.teleportservice = {
    __type: 'TeleportService',
    Name: 'TeleportService',
    ClassName: 'TeleportService',
    Teleport: (placeId: number, _player?: any) => {
      onLog('system', `TeleportService.Teleport called for place ${placeId} (no-op in this simulation)`);
    },
    TeleportAsync: (placeId: number) => {
      onLog('system', `TeleportService:TeleportAsync called for place ${placeId} (no-op in this simulation)`);
      return { __type: 'TeleportAsyncResult' };
    },
    GetPlayerPlaceInstanceAsync: () => [true, 'placeholder-job-id'],
  };

  // ---- MarketplaceService -----------------------------------------------
  // No real economy/monetization backend, so purchases always resolve as
  // "not purchased" rather than either erroring or silently succeeding.
  services.marketplaceservice = {
    __type: 'MarketplaceService',
    Name: 'MarketplaceService',
    ClassName: 'MarketplaceService',
    PromptPurchase: (_player: any, _assetId: number) => {
      onLog('system', 'MarketplaceService:PromptPurchase called (no purchase UI in this simulation)');
    },
    PromptGamePassPurchase: (_player: any, _gamePassId: number) => {
      onLog('system', 'MarketplaceService:PromptGamePassPurchase called (no purchase UI in this simulation)');
    },
    UserOwnsGamePassAsync: () => false,
    PlayerOwnsAsset: () => false,
    GetProductInfo: (assetId: number) => ({
      __type: 'ProductInfo',
      Name: `Asset ${assetId}`,
      Description: '',
      PriceInRobux: 0,
      ProductId: assetId,
    }),
  };

  return services;
}

function createGameProxy(
  getTree: () => TreeNodeData[],
  updateTree: (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => void,
  onLog: (type: LogType, message: string) => void,
  bridge?: LuaBridge
): any {
  const workspaceProxy = createInstanceProxy('workspace', getTree, updateTree, onLog, bridge);
  const engineServices = buildEngineServices(getTree, updateTree, onLog, bridge, workspaceProxy);

  const gameObj = {
    __type: 'DataModel',
    Name: 'Game',
    ClassName: 'DataModel',
    Workspace: workspaceProxy,
    workspace: workspaceProxy,

    GetService: (serviceName: string) => {
      const lower = serviceName.toLowerCase();
      if (lower === 'workspace') return workspaceProxy;
      if (engineServices[lower]) return engineServices[lower];
      const serviceNode = getTree().find((n) => n.name.toLowerCase() === lower || n.id.toLowerCase() === lower);
      if (serviceNode) {
        return createInstanceProxy(serviceNode.id, getTree, updateTree, onLog, bridge);
      }
      return {
        __type: serviceName,
        Name: serviceName,
        ClassName: serviceName,
        FindFirstChild: () => null,
        GetChildren: () => [],
      };
    },

    FindFirstChild: (name: string) => {
      const node = getTree().find((n) => n.name === name);
      return node ? createInstanceProxy(node.id, getTree, updateTree, onLog, bridge) : null;
    },

    GetChildren: () => {
      return getTree().map((n) => createInstanceProxy(n.id, getTree, updateTree, onLog, bridge));
    },

    toString: () => 'Game',
  };

  return new Proxy(gameObj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return (target as any)[prop];
      if (prop in target) return (target as any)[prop];
      const lower = String(prop).toLowerCase();
      if (lower === 'workspace') return workspaceProxy;
      const node = getTree().find((n) => n.name === String(prop) || n.id.toLowerCase() === lower);
      if (node) return createInstanceProxy(node.id, getTree, updateTree, onLog, bridge);
      return undefined;
    },
  });
}

export class LuaRuntime {
  private engine: LuaEngine | null = null;
  private isRunning = false;
  private schedulerTimeout: NodeJS.Timeout | null = null;
  private luaStepFn: ((now: number) => number) | null = null;
  private markFiredFn: ((channel: string, ...args: any[]) => void) | null = null;
  private lastFrameTime = 0;
  private static readonly FRAME_INTERVAL_MS = 1000 / 60;

  async start(
    scripts: { id: string; name: string; code: string; type: string }[],
    modules: Record<string, string>,
    onLog: (type: LogType, message: string) => void,
    getTree: () => TreeNodeData[],
    updateTree: (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => void,
    side: 'server' | 'client' = 'server'
  ) {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const luaFactory = getLuaFactory();
      this.engine = await luaFactory.createEngine({ openStandardLibs: true, injectObjects: true });

      const formatArgs = (...args: any[]): string => {
        return args
          .map((arg) => {
            if (arg === null || arg === undefined) return 'nil';
            if (typeof arg === 'object') {
              if (arg.toString && arg.__type) return arg.toString();
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join('    ');
      };

      this.engine.global.set('print', (...args: any[]) => onLog('print', formatArgs(...args)));
      this.engine.global.set('warn', (...args: any[]) => onLog('warn', formatArgs(...args)));
      this.engine.global.set('error', (msg: string) => {
        const formatted = String(msg || 'Script error');
        onLog('error', formatted);
        throw new Error(formatted);
      });
      this.engine.global.set('typeof', (val: any) => {
        if (val === null || val === undefined) return 'nil';
        if (val && val.__type) return val.__type;
        return typeof val;
      });

      this.engine.global.set('tick', () => Date.now() / 1000);
      this.engine.global.set('time', () => performance.now() / 1000);

      // Define core math and Roblox libraries natively in Lua for 100% metatable & performance fidelity
      await this.engine.doString(`
        -- Vector3 Library
        local Vector3 = {}
        Vector3.__type = "Vector3"

        function Vector3.new(x, y, z)
          return setmetatable({
            X = tonumber(x) or 0,
            Y = tonumber(y) or 0,
            Z = tonumber(z) or 0,
            __type = "Vector3"
          }, Vector3)
        end

        Vector3.zero = Vector3.new(0, 0, 0)
        Vector3.one = Vector3.new(1, 1, 1)
        Vector3.xAxis = Vector3.new(1, 0, 0)
        Vector3.yAxis = Vector3.new(0, 1, 0)
        Vector3.zAxis = Vector3.new(0, 0, 1)

        function Vector3.__add(a, b)
          return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z)
        end

        function Vector3.__sub(a, b)
          return Vector3.new(a.X - b.X, a.Y - b.Y, a.Z - b.Z)
        end

        function Vector3.__unm(a)
          return Vector3.new(-a.X, -a.Y, -a.Z)
        end

        function Vector3.__mul(a, b)
          if type(a) == "number" then
            return Vector3.new(a * b.X, a * b.Y, a * b.Z)
          elseif type(b) == "number" then
            return Vector3.new(a.X * b, a.Y * b, a.Z * b)
          elseif type(a) == "table" and type(b) == "table" and a.__type == "Vector3" and b.__type == "Vector3" then
            return Vector3.new(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
          else
            error("Attempt to multiply Vector3 with incompatible type")
          end
        end

        function Vector3.__div(a, b)
          if type(b) == "number" then
            return Vector3.new(a.X / b, a.Y / b, a.Z / b)
          elseif type(b) == "table" and b.__type == "Vector3" then
            return Vector3.new(a.X / b.X, a.Y / b.Y, a.Z / b.Z)
          else
            error("Attempt to divide Vector3 with incompatible type")
          end
        end

        function Vector3.__eq(a, b)
          return a.X == b.X and a.Y == b.Y and a.Z == b.Z
        end

        function Vector3.__tostring(v)
          return string.format("%.3f, %.3f, %.3f", v.X, v.Y, v.Z)
        end

        function Vector3:Dot(other)
          return self.X * other.X + self.Y * other.Y + self.Z * other.Z
        end

        function Vector3:Cross(other)
          return Vector3.new(
            self.Y * other.Z - self.Z * other.Y,
            self.Z * other.X - self.X * other.Z,
            self.X * other.Y - self.Y * other.X
          )
        end

        function Vector3:Lerp(target, alpha)
          return self + (target - self) * alpha
        end

        local Vector3_meta_index = function(t, k)
          if k == "Magnitude" or k == "magnitude" then
            return math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z)
          elseif k == "Unit" or k == "unit" then
            local m = math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z)
            if m == 0 then return Vector3.zero end
            return Vector3.new(t.X / m, t.Y / m, t.Z / m)
          elseif k == "x" then return t.X
          elseif k == "y" then return t.Y
          elseif k == "z" then return t.Z
          else
            return Vector3[k]
          end
        end
        Vector3.__index = Vector3_meta_index
        _G.Vector3 = Vector3

        -- CFrame Library
        local CFrame = {}
        CFrame.__type = "CFrame"

        local function make_cframe(x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22)
          return setmetatable({
            X = tonumber(x) or 0,
            Y = tonumber(y) or 0,
            Z = tonumber(z) or 0,
            r00 = tonumber(r00) or 1, r01 = tonumber(r01) or 0, r02 = tonumber(r02) or 0,
            r10 = tonumber(r10) or 0, r11 = tonumber(r11) or 1, r12 = tonumber(r12) or 0,
            r20 = tonumber(r20) or 0, r21 = tonumber(r21) or 0, r22 = tonumber(r22) or 1,
            __type = "CFrame"
          }, CFrame)
        end

        function CFrame.new(a, b, c, d, e, f, g, h, i, j, k, l)
          if not a then
            return make_cframe(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
          elseif type(a) == "table" and a.__type == "Vector3" then
            if type(b) == "table" and b.__type == "Vector3" then
              return CFrame.lookAt(a, b)
            else
              return make_cframe(a.X, a.Y, a.Z, 1, 0, 0, 0, 1, 0, 0, 0, 1)
            end
          elseif d and e and f and g and h and i and j and k and l then
            return make_cframe(a, b, c, d, e, f, g, h, i, j, k, l)
          elseif d and e and f and g then
            local qx, qy, qz, qw = d, e, f, g
            local r00 = 1 - 2 * (qy*qy + qz*qz)
            local r01 = 2 * (qx*qy - qz*qw)
            local r02 = 2 * (qx*qz + qy*qw)
            local r10 = 2 * (qx*qy + qz*qw)
            local r11 = 1 - 2 * (qx*qx + qz*qz)
            local r12 = 2 * (qy*qz - qx*qw)
            local r20 = 2 * (qx*qz - qy*qw)
            local r21 = 2 * (qy*qz + qx*qw)
            local r22 = 1 - 2 * (qx*qx + qy*qy)
            return make_cframe(a, b, c, r00, r01, r02, r10, r11, r12, r20, r21, r22)
          else
            return make_cframe(a or 0, b or 0, c or 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
          end
        end

        CFrame.identity = make_cframe(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)

        function CFrame.Angles(rx, ry, rz)
          rx = tonumber(rx) or 0
          ry = tonumber(ry) or 0
          rz = tonumber(rz) or 0
          local cx, sx = math.cos(rx), math.sin(rx)
          local cy, sy = math.cos(ry), math.sin(ry)
          local cz, sz = math.cos(rz), math.sin(rz)
          return make_cframe(
            0, 0, 0,
            cy * cz,                -cy * sz,               sy,
            cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
            sx * sz - cx * sy * cz, sx * cz + cx * sy * sz,  cx * cy
          )
        end
        CFrame.fromEulerAnglesXYZ = CFrame.Angles

        function CFrame.fromEulerAnglesYXZ(rx, ry, rz)
          rx = tonumber(rx) or 0
          ry = tonumber(ry) or 0
          rz = tonumber(rz) or 0
          local cx, sx = math.cos(rx), math.sin(rx)
          local cy, sy = math.cos(ry), math.sin(ry)
          local cz, sz = math.cos(rz), math.sin(rz)
          return make_cframe(
            0, 0, 0,
            cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
            cx * sz,                cx * cz,               -sx,
            -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
          )
        end
        CFrame.fromOrientation = CFrame.fromEulerAnglesYXZ

        function CFrame.fromAxisAngle(v, rad)
          local x, y, z = v.X, v.Y, v.Z
          local m = math.sqrt(x*x + y*y + z*z)
          if m > 0 then x = x/m; y = y/m; z = z/m end
          local c = math.cos(rad)
          local s = math.sin(rad)
          local t = 1 - c
          return make_cframe(
            0, 0, 0,
            t*x*x + c,   t*x*y - s*z, t*x*z + s*y,
            t*x*y + s*z, t*y*y + c,   t*y*z - s*x,
            t*x*z - s*y, t*y*z + s*x, t*z*z + c
          )
        end

        function CFrame.lookAt(eye, target, up)
          up = up or Vector3.new(0, 1, 0)
          local f = (target - eye).Unit
          if f.Magnitude == 0 then f = Vector3.new(0, 0, -1) end
          local r = f:Cross(up).Unit
          if r.Magnitude == 0 then r = Vector3.new(1, 0, 0) end
          local u = r:Cross(f).Unit
          return make_cframe(
            eye.X, eye.Y, eye.Z,
            r.X, u.X, -f.X,
            r.Y, u.Y, -f.Y,
            r.Z, u.Z, -f.Z
          )
        end

        function CFrame.__mul(a, b)
          if type(b) == "table" and b.__type == "CFrame" then
            return make_cframe(
              a.X + a.r00 * b.X + a.r01 * b.Y + a.r02 * b.Z,
              a.Y + a.r10 * b.X + a.r11 * b.Y + a.r12 * b.Z,
              a.Z + a.r20 * b.X + a.r21 * b.Y + a.r22 * b.Z,
              a.r00 * b.r00 + a.r01 * b.r10 + a.r02 * b.r20,
              a.r00 * b.r01 + a.r01 * b.r11 + a.r02 * b.r21,
              a.r00 * b.r02 + a.r01 * b.r12 + a.r02 * b.r22,
              a.r10 * b.r00 + a.r11 * b.r10 + a.r12 * b.r20,
              a.r10 * b.r01 + a.r11 * b.r11 + a.r12 * b.r21,
              a.r10 * b.r02 + a.r11 * b.r12 + a.r12 * b.r22,
              a.r20 * b.r00 + a.r21 * b.r10 + a.r22 * b.r20,
              a.r20 * b.r01 + a.r21 * b.r11 + a.r22 * b.r21,
              a.r20 * b.r02 + a.r21 * b.r12 + a.r22 * b.r22
            )
          elseif type(b) == "table" and b.__type == "Vector3" then
            return Vector3.new(
              a.X + a.r00 * b.X + a.r01 * b.Y + a.r02 * b.Z,
              a.Y + a.r10 * b.X + a.r11 * b.Y + a.r12 * b.Z,
              a.Z + a.r20 * b.X + a.r21 * b.Y + a.r22 * b.Z
            )
          else
            error("Attempt to multiply CFrame with incompatible type")
          end
        end

        function CFrame.__add(a, b)
          if type(b) == "table" and b.__type == "Vector3" then
            return make_cframe(a.X + b.X, a.Y + b.Y, a.Z + b.Z, a.r00, a.r01, a.r02, a.r10, a.r11, a.r12, a.r20, a.r21, a.r22)
          end
          error("Attempt to add non-Vector3 to CFrame")
        end

        function CFrame.__sub(a, b)
          if type(b) == "table" and b.__type == "Vector3" then
            return make_cframe(a.X - b.X, a.Y - b.Y, a.Z - b.Z, a.r00, a.r01, a.r02, a.r10, a.r11, a.r12, a.r20, a.r21, a.r22)
          end
          error("Attempt to subtract non-Vector3 from CFrame")
        end

        function CFrame.__tostring(cf)
          return string.format("%.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f, %.3f",
            cf.X, cf.Y, cf.Z,
            cf.r00, cf.r01, cf.r02,
            cf.r10, cf.r11, cf.r12,
            cf.r20, cf.r21, cf.r22
          )
        end

        function CFrame:Inverse()
          return make_cframe(
            -(self.r00 * self.X + self.r10 * self.Y + self.r20 * self.Z),
            -(self.r01 * self.X + self.r11 * self.Y + self.r21 * self.Z),
            -(self.r02 * self.X + self.r12 * self.Y + self.r22 * self.Z),
            self.r00, self.r10, self.r20,
            self.r01, self.r11, self.r21,
            self.r02, self.r12, self.r22
          )
        end

        function CFrame:ToEulerAnglesXYZ()
          local sy = math.max(-1, math.min(1, self.r02))
          local ry = math.asin(sy)
          local rx, rz
          if math.abs(math.cos(ry)) > 1e-6 then
            rx = math.atan2(-self.r12, self.r22)
            rz = math.atan2(-self.r01, self.r00)
          else
            rx = math.atan2(self.r21, self.r11)
            rz = 0
          end
          return rx, ry, rz
        end
        CFrame.ToOrientation = CFrame.ToEulerAnglesXYZ

        function CFrame:ToEulerAnglesYXZ()
          local sx = math.max(-1, math.min(1, -self.r12))
          local rx = math.asin(sx)
          local ry, rz
          if math.abs(math.cos(rx)) > 1e-6 then
            ry = math.atan2(self.r02, self.r22)
            rz = math.atan2(self.r10, self.r11)
          else
            ry = math.atan2(-self.r20, self.r00)
            rz = 0
          end
          return ry, rx, rz
        end

        function CFrame:PointToWorldSpace(v)
          return self * v
        end

        function CFrame:VectorToWorldSpace(v)
          return Vector3.new(
            self.r00 * v.X + self.r01 * v.Y + self.r02 * v.Z,
            self.r10 * v.X + self.r11 * v.Y + self.r12 * v.Z,
            self.r20 * v.X + self.r21 * v.Y + self.r22 * v.Z
          )
        end

        function CFrame:PointToObjectSpace(v)
          return self:Inverse() * v
        end

        function CFrame:VectorToObjectSpace(v)
          return self:Inverse():VectorToWorldSpace(v)
        end

        function CFrame:GetComponents()
          return self.X, self.Y, self.Z, self.r00, self.r01, self.r02, self.r10, self.r11, self.r12, self.r20, self.r21, self.r22
        end

        local CFrame_meta_index = function(t, k)
          if k == "Position" or k == "p" then
            return Vector3.new(t.X, t.Y, t.Z)
          elseif k == "LookVector" or k == "lookVector" then
            return Vector3.new(-t.r02, -t.r12, -t.r22)
          elseif k == "RightVector" or k == "rightVector" then
            return Vector3.new(t.r00, t.r10, t.r20)
          elseif k == "UpVector" or k == "upVector" then
            return Vector3.new(t.r01, t.r11, t.r21)
          elseif k == "Rotation" then
            return make_cframe(0, 0, 0, t.r00, t.r01, t.r02, t.r10, t.r11, t.r12, t.r20, t.r21, t.r22)
          elseif k == "x" then return t.X
          elseif k == "y" then return t.Y
          elseif k == "z" then return t.Z
          else
            return CFrame[k]
          end
        end
        CFrame.__index = CFrame_meta_index
        _G.CFrame = CFrame

        -- Color3 Library
        local Color3 = {}
        Color3.__index = Color3
        Color3.__type = "Color3"

        function Color3.new(r, g, b)
          return setmetatable({ R = tonumber(r) or 0, G = tonumber(g) or 0, B = tonumber(b) or 0, __type = "Color3" }, Color3)
        end

        function Color3.fromRGB(r, g, b)
          return Color3.new((tonumber(r) or 0) / 255, (tonumber(g) or 0) / 255, (tonumber(b) or 0) / 255)
        end

        function Color3.fromHSV(h, s, v)
          h = (tonumber(h) or 0) % 1
          s = math.max(0, math.min(1, tonumber(s) or 0))
          v = math.max(0, math.min(1, tonumber(v) or 0))
          local i = math.floor(h * 6)
          local f = h * 6 - i
          local p = v * (1 - s)
          local q = v * (1 - f * s)
          local t = v * (1 - (1 - f) * s)
          local r, g, b
          local rem = i % 6
          if rem == 0 then r, g, b = v, t, p
          elseif rem == 1 then r, g, b = q, v, p
          elseif rem == 2 then r, g, b = p, v, t
          elseif rem == 3 then r, g, b = p, q, v
          elseif rem == 4 then r, g, b = t, p, v
          elseif rem == 5 then r, g, b = v, p, q
          end
          return Color3.new(r, g, b)
        end

        function Color3.fromHex(hex)
          hex = tostring(hex):gsub("#", "")
          local r = (tonumber(hex:sub(1, 2), 16) or 0) / 255
          local g = (tonumber(hex:sub(3, 4), 16) or 0) / 255
          local b = (tonumber(hex:sub(5, 6), 16) or 0) / 255
          return Color3.new(r, g, b)
        end

        function Color3:Lerp(target, alpha)
          return Color3.new(
            self.R + (target.R - self.R) * alpha,
            self.G + (target.G - self.G) * alpha,
            self.B + (target.B - self.B) * alpha
          )
        end

        function Color3.__tostring(c)
          return string.format("%.3f, %.3f, %.3f", c.R, c.G, c.B)
        end
        _G.Color3 = Color3

        -- TweenInfo and Enum values used by TweenService scripts
        local TweenInfo = {}
        TweenInfo.__index = TweenInfo
        TweenInfo.__type = "TweenInfo"
        function TweenInfo.new(time, easingStyle, easingDirection, repeatCount, reverses, delayTime)
          return setmetatable({
            Time = tonumber(time) or 1,
            EasingStyle = easingStyle,
            EasingDirection = easingDirection,
            RepeatCount = tonumber(repeatCount) or 0,
            Reverses = reverses == true,
            DelayTime = tonumber(delayTime) or 0,
            __type = "TweenInfo"
          }, TweenInfo)
        end
        _G.TweenInfo = TweenInfo

        _G.Enum = {
          EasingStyle = { Linear = "Linear", Sine = "Sine", Back = "Back", Quad = "Quad", Cubic = "Cubic", Quart = "Quart", Quint = "Quint", Bounce = "Bounce", Elastic = "Elastic", Exponential = "Exponential", Circular = "Circular" },
          EasingDirection = { In = "In", Out = "Out", InOut = "InOut" },
          PlaybackState = { Begin = "Begin", Delayed = "Delayed", Playing = "Playing", Paused = "Paused", Completed = "Completed", Canceled = "Canceled" },
          Technology = { Compatibility = "Compatibility", Voxel = "Voxel", ShadowMap = "ShadowMap", Future = "Future" },
          NormalId = { Top = "Top", Bottom = "Bottom", Front = "Front", Back = "Back", Left = "Left", Right = "Right" },
        }

        -- BrickColor Library
        local BRICK_COLORS = {
          ["Medium stone grey"] = "#a3a2a5",
          ["Dark stone grey"] = "#635f62",
          ["Light stone grey"] = "#e5e3df",
          ["Bright red"] = "#c4281c",
          ["Bright blue"] = "#0d69ac",
          ["Bright green"] = "#287f46",
          ["Bright yellow"] = "#f5cd2f",
          ["Bright orange"] = "#da8541",
          ["Bright violet"] = "#6b327c",
          ["White"] = "#f2f3f3",
          ["Black"] = "#1b2a34",
          ["Really red"] = "#ff0000",
          ["Really black"] = "#000000",
          ["Really blue"] = "#0000ff",
          ["Lime green"] = "#00ff00",
          ["Hot pink"] = "#ff66cc",
        }

        local BrickColor = {}
        BrickColor.__index = BrickColor
        BrickColor.__type = "BrickColor"

        function BrickColor.new(val)
          if type(val) == "string" then
            local hex = BRICK_COLORS[val] or "#a3a2a5"
            return setmetatable({ Name = val, Color = Color3.fromHex(hex), __type = "BrickColor" }, BrickColor)
          elseif type(val) == "table" and val.__type == "Color3" then
            return setmetatable({ Name = "Custom", Color = val, __type = "BrickColor" }, BrickColor)
          else
            return setmetatable({ Name = "Medium stone grey", Color = Color3.fromHex("#a3a2a5"), __type = "BrickColor" }, BrickColor)
          end
        end

        function BrickColor.random()
          local keys = {}
          for k in pairs(BRICK_COLORS) do table.insert(keys, k) end
          local k = keys[math.random(1, #keys)]
          return BrickColor.new(k)
        end

        function BrickColor.Red() return BrickColor.new("Bright red") end
        function BrickColor.Blue() return BrickColor.new("Bright blue") end
        function BrickColor.Green() return BrickColor.new("Bright green") end
        function BrickColor.Yellow() return BrickColor.new("Bright yellow") end
        function BrickColor.White() return BrickColor.new("White") end
        function BrickColor.Black() return BrickColor.new("Black") end
        function BrickColor.Gray() return BrickColor.new("Medium stone grey") end

        function BrickColor.__tostring(bc)
          return bc.Name or "BrickColor"
        end
        _G.BrickColor = BrickColor

        -- Math enhancements
        math.clamp = function(x, min, max) return math.max(min, math.min(max, x)) end
        math.sign = function(x) if x > 0 then return 1 elseif x < 0 then return -1 else return 0 end end
        math.round = function(x) return math.floor(x + 0.5) end

        -- CFrame & Vector3 bridge helpers
        function __MAKE_CFRAME(x, y, z, rx, ry, rz)
          local p = CFrame.new(x or 0, y or 0, z or 0)
          local r = CFrame.Angles(rx or 0, ry or 0, rz or 0)
          return p * r
        end

        function __MAKE_VECTOR3(x, y, z)
          return Vector3.new(x or 0, y or 0, z or 0)
        end

        function __MAKE_COLOR3(r, g, b)
          return Color3.new(r or 0, g or 0, b or 0)
        end
      `);

      // Inject these at the engine boundary as well as defining them in Lua.
      // Script environments inherit from this table and must see them as globals.
      const KEYCODE_NAMES = [
        'Backspace', 'Tab', 'Return', 'Escape', 'Space', 'QuotedDouble', 'Hash', 'Dollar',
        'Quote', 'LeftParenthesis', 'RightParenthesis', 'Asterisk', 'Plus', 'Comma', 'Minus',
        'Period', 'Slash', 'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
        'Eight', 'Nine', 'Colon', 'Semicolon', 'Less', 'Equals', 'Greater', 'Question', 'At',
        'LeftBracket', 'BackSlash', 'RightBracket', 'Caret', 'Underscore', 'Backquote',
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q',
        'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        'LeftCurly', 'Pipe', 'RightCurly', 'Tilde', 'Delete',
        'KeypadZero', 'KeypadOne', 'KeypadTwo', 'KeypadThree', 'KeypadFour', 'KeypadFive',
        'KeypadSix', 'KeypadSeven', 'KeypadEight', 'KeypadNine', 'KeypadPeriod', 'KeypadDivide',
        'KeypadMultiply', 'KeypadMinus', 'KeypadPlus', 'KeypadEnter', 'KeypadEquals',
        'Up', 'Down', 'Right', 'Left', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'CapsLock', 'NumLock', 'ScrollLock', 'LeftShift', 'RightShift', 'LeftControl',
        'RightControl', 'LeftAlt', 'RightAlt', 'LeftMeta', 'RightMeta', 'LeftSuper', 'RightSuper',
        'Unknown',
      ];
      const KeyCodeEnum: Record<string, { __type: string; Name: string; Value: number }> = {};
      KEYCODE_NAMES.forEach((name, i) => {
        KeyCodeEnum[name] = { __type: 'EnumItem', Name: name, Value: i };
      });

      this.engine.global.set('Enum', {
        EasingStyle: { Linear: 'Linear', Sine: 'Sine', Back: 'Back', Quad: 'Quad', Cubic: 'Cubic', Quart: 'Quart', Quint: 'Quint', Bounce: 'Bounce', Elastic: 'Elastic', Exponential: 'Exponential', Circular: 'Circular' },
        EasingDirection: { In: 'In', Out: 'Out', InOut: 'InOut' },
        PlaybackState: { Begin: 'Begin', Delayed: 'Delayed', Playing: 'Playing', Paused: 'Paused', Completed: 'Completed', Canceled: 'Canceled' },
        Material: { Plastic: 'Plastic', SmoothPlastic: 'SmoothPlastic', Neon: 'Neon', Wood: 'Wood', Metal: 'Metal', Glass: 'Glass', Brick: 'Brick', Concrete: 'Concrete' },
        PartType: { Ball: 'Ball', Block: 'Block', Cylinder: 'Cylinder', Wedge: 'Wedge' },
        Technology: { Compatibility: 'Compatibility', Voxel: 'Voxel', ShadowMap: 'ShadowMap', Future: 'Future' },
        NormalId: { Top: 'Top', Bottom: 'Bottom', Front: 'Front', Back: 'Back', Left: 'Left', Right: 'Right' },
        UserInputType: {
          MouseButton1: 'MouseButton1', MouseButton2: 'MouseButton2', MouseButton3: 'MouseButton3',
          MouseWheel: 'MouseWheel', MouseMovement: 'MouseMovement', Keyboard: 'Keyboard',
          Touch: 'Touch', Gamepad1: 'Gamepad1', None: 'None',
        },
        UserInputState: { Begin: 'Begin', Change: 'Change', End: 'End', Cancel: 'Cancel', None: 'None' },
        KeyCode: KeyCodeEnum,
        HumanoidStateType: {
          Running: 'Running', Jumping: 'Jumping', Freefall: 'Freefall', Landed: 'Landed',
          Climbing: 'Climbing', Swimming: 'Swimming', Seated: 'Seated', Dead: 'Dead', None: 'None',
        },
      });
      this.engine.global.set('TweenInfo', {
        new: (time = 1, easingStyle?: any, easingDirection?: any, repeatCount = 0, reverses = false, delayTime = 0) => ({
          __type: 'TweenInfo',
          Time: Number(time) || 1,
          EasingStyle: easingStyle,
          EasingDirection: easingDirection,
          RepeatCount: Number(repeatCount) || 0,
          Reverses: reverses === true,
          DelayTime: Number(delayTime) || 0,
        }),
      });

      const makeCFrame = this.engine.global.get('__MAKE_CFRAME');
      const makeVector3 = this.engine.global.get('__MAKE_VECTOR3');
      const makeColor3 = this.engine.global.get('__MAKE_COLOR3');

      const bridge: LuaBridge = {
        makeCFrame: (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => makeCFrame(x, y, z, rx, ry, rz),
        makeVector3: (x = 0, y = 0, z = 0) => makeVector3(x, y, z),
        makeColor3: (r = 0, g = 0, b = 0) => makeColor3(r, g, b),
        side,
      };

      // Lua-side helpers implementing real RBXScriptSignal:Wait() semantics
      // for engine services (RunService.Heartbeat, UserInputService.InputBegan,
      // etc). This MUST be pure Lua, invoked from pure Lua, all the way down
      // to the coroutine.yield call — any value that has round-tripped
      // through a JS function call (including a JS object's property
      // getter, or a JS function that itself calls one of these Lua helpers
      // and returns the result) has its methods re-marshalled such that
      // calling them re-enters JS, and yielding from inside a re-entered JS
      // call fails with "attempt to yield across a C-call boundary".
      //
      // A second, subtler pitfall: once a JS object is reached through a
      // Lua table's __index (rather than being a JS object itself), Lua's
      // normal colon-call sugar (`sig:Connect(fn)` => `sig.Connect(sig, fn)`)
      // passes the Lua wrapper table as an extra leading argument. A raw JS
      // method like `Connect: (fn) => ...` then receives the wrapper table
      // where it expects `fn`, silently breaking the callback. Every
      // forwarded method below is therefore an explicit Lua closure of the
      // form `function(_self, ...) return v(...) end` that swallows that
      // implicit self before calling into JS.
      //
      // So: JS never hands Lua a ready-made "waitable" signal or a wrapped
      // service. JS exposes only *raw* signals/services (Connect/Once, plus
      // __getRawSignal / __signalNames markers), and `game` itself — along
      // with GetService — is rebuilt as a pure-Lua proxy right here, so the
      // wrapping never leaves this Lua chunk before a script sees it.
      await this.engine.doString(`
        function __WRAP_RBX_SIGNAL(signal)
          if signal == nil then return nil end
          return setmetatable({}, {
            __index = function(_t, key)
              if key == "Wait" then
                return function(_self)
                  return coroutine.yield("RBXWAIT", signal.__hubChannel)
                end
              end
              local v = signal[key]
              if type(v) == "function" then
                return function(_self, ...) return v(...) end
              end
              return v
            end
          })
        end
        _G.__WRAP_RBX_SIGNAL = __WRAP_RBX_SIGNAL

        -- Wraps a JS-provided service object so that:
        --  * fields listed in the service's __signalNames resolve through
        --    __getRawSignal(name) and come back wrapped with a real Wait()
        --  * methods listed in __signalMethods have their return value
        --    wrapped the same way (for signal-returning methods that take
        --    arguments, e.g. CollectionService:GetInstanceAddedSignal(tag))
        --  * everything else forwards straight through to the raw service
        function __WRAP_SERVICE(raw)
          if raw == nil then return nil end
          local signalNames = {}
          for _, n in ipairs(raw.__signalNames or {}) do signalNames[n] = true end
          local signalMethods = {}
          for _, n in ipairs(raw.__signalMethods or {}) do signalMethods[n] = true end
          local objectMethods = {}
          for _, n in ipairs(raw.__objectMethods or {}) do objectMethods[n] = true end

          if not next(signalNames) and not next(signalMethods) and not next(objectMethods) then
            -- Nothing on this service needs Wait() support — hand it back
            -- as-is rather than paying for an extra indirection layer.
            return raw
          end

          return setmetatable({}, {
            __index = function(_t, key)
              if signalNames[key] then
                return __WRAP_RBX_SIGNAL(raw.__getRawSignal(key))
              end
              local v = raw[key]
              if signalMethods[key] and type(v) == "function" then
                return function(_self, ...)
                  return __WRAP_RBX_SIGNAL(v(raw, ...))
                end
              end
              if objectMethods[key] and type(v) == "function" then
                return function(_self, target, ...)
                  -- target is a table produced by __WRAP_INSTANCE: an empty
                  -- table whose properties only exist via a metatable
                  -- __index/__newindex. Lua tables cross back into JS by raw
                  -- key/value copy (lua_next), which never invokes
                  -- metamethods, so JS would otherwise receive a lifeless
                  -- empty object and the tween would silently animate
                  -- nothing. Reading __nodeId here happens as real Lua
                  -- bytecode, so it does go through __index and gives JS a
                  -- plain string it can use to look the live instance back up.
                  local nodeId = nil
                  if type(target) == "table" then
                    local ok, id = pcall(function() return target.__nodeId end)
                    if ok and id ~= nil then nodeId = id end
                  end
                  return __WRAP_TWEEN(v(nodeId or target, ...))
                end
              end
              if type(v) == "function" then
                return function(_self, ...)
                  return v(raw, ...)
                end
              end
              return v
            end
          })
        end
        _G.__WRAP_SERVICE = __WRAP_SERVICE

        function __WRAP_TWEEN(raw)
          if raw == nil then return nil end
          return setmetatable({}, {
            __index = function(_t, key)
              if key == "Completed" then
                local signal = raw.Completed
                return setmetatable({}, {
                  __index = function(_signal, signalKey)
                    if signalKey == "Wait" then
                      return function(_self)
                        while not raw.__getCompletedState() do
                          coroutine.yield("WAIT", 0.03)
                        end
                        return "Completed"
                      end
                    end
                    local value = signal[signalKey]
                    if type(value) == "function" then
                      return function(_signalSelf, ...) return value(...) end
                    end
                    return value
                  end
                })
              end
              local value = raw[key]
              if type(value) == "function" then
                return function(_self, ...) return value(raw, ...) end
              end
              return value
            end
          })
        end
        _G.__WRAP_TWEEN = __WRAP_TWEEN

        function __WRAP_INSTANCE_VALUE(value)
          if value == nil then return nil end
          local valueType = type(value)
          if valueType == "table" or valueType == "userdata" then
            local valueKind = value.__type
            if valueKind == "Vector3" then
              return Vector3.new(value.X, value.Y, value.Z)
            elseif valueKind == "Color3" then
              return Color3.new(value.R, value.G, value.B)
            elseif valueKind == "Instance" and value.__nodeId then
              return __WRAP_INSTANCE(value)
            end
            if valueType == "userdata" then return value end
            local result = {}
            for k, v in pairs(value) do
              result[k] = __WRAP_INSTANCE_VALUE(v)
            end
            return result
          end
          return value
        end

        function __WRAP_INSTANCE(raw)
          if raw == nil then return nil end
          return setmetatable({}, {
            __index = function(_t, key)
              local value = raw[key]
              if (key == "Color" or key == "Color3") and value ~= nil then
                return Color3.new(value.R, value.G, value.B)
              end
              if type(value) == "function" then
                return function(_self, ...)
                  if key == "GetChildren" or key == "GetDescendants" then
                    local children = value(raw, ...)
                    local result = {}
                    for _, child in ipairs(children or {}) do
                      result[#result + 1] = __WRAP_INSTANCE(child)
                    end
                    return result
                  end
                  return __WRAP_INSTANCE_VALUE(value(raw, ...))
                end
              end
              return __WRAP_INSTANCE_VALUE(value)
            end,
            __newindex = function(_t, key, value)
              raw[key] = value
            end,
          })
        end
        _G.__WRAP_INSTANCE = __WRAP_INSTANCE
      `);

      const workspaceProxy = createInstanceProxy('workspace', getTree, updateTree, onLog, bridge);
      const gameProxyRaw = createGameProxy(getTree, updateTree, onLog, bridge);

      // `game` is exposed to scripts as a pure-Lua proxy around the raw JS
      // gameProxy, rather than the JS object directly, so that
      // `game:GetService(name)` runs as Lua bytecode and can wrap its
      // result with __WRAP_SERVICE *before* handing it back to the calling
      // script — see the big comment above __WRAP_RBX_SIGNAL for why that
      // has to happen without ever crossing back out to JS in between.
      this.engine.global.set('__GAME_RAW', gameProxyRaw);
      await this.engine.doString(`
        game = setmetatable({}, {
          __index = function(_t, key)
            if key == "GetService" then
              return function(_self, name)
                local service = __WRAP_SERVICE(__GAME_RAW:GetService(name))
                if service and service.__type == "Instance" then
                  return __WRAP_INSTANCE_VALUE(service)
                end
                return service
              end
            end
            local v = __GAME_RAW[key]
            if type(v) == "function" then
              return function(_self, ...) return __WRAP_INSTANCE_VALUE(v(...)) end
            end
            return __WRAP_INSTANCE_VALUE(v)
          end
        })
        _G.game = game
      `);
      this.engine.global.set('__WORKSPACE_RAW', workspaceProxy);
      await this.engine.doString(`workspace = __WRAP_INSTANCE(__WORKSPACE_RAW); _G.workspace = workspace`);

      // Instance.new
      this.engine.global.set('__CREATE_INSTANCE_RAW', (className: string, parent?: any) => {
        const newId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const typeMap: Record<string, string> = {
          Part: 'part',
          SpawnLocation: 'spawnlocation',
          Script: 'script',
          LocalScript: 'localscript',
          ModuleScript: 'modulescript',
          Folder: 'folder',
          Model: 'model',
          Decal: 'decal',
          Texture: 'texture',
          RemoteEvent: 'remoteevent',
          RemoteFunction: 'remotefunction',
          PointLight: 'pointlight',
          SpotLight: 'spotlight',
          SurfaceLight: 'surfacelight',
          Sky: 'sky',
          Atmosphere: 'atmosphere',
          ColorCorrectionEffect: 'colorcorrectioneffect',
          BloomEffect: 'bloomeffect',
          SunRaysEffect: 'sunrayseffect',
          BlurEffect: 'blureffect',
          DepthOfFieldEffect: 'depthoffieldeffect',
        };
        const nodeType = typeMap[className] || 'object';

        let parentId = 'workspace';
        if (parent && parent.__nodeId) parentId = parent.__nodeId;
        else if (parent && (parent.Name === 'Workspace' || parent === workspaceProxy)) parentId = 'workspace';
        else if (parent && parent.Name === 'Lighting') parentId = 'lighting';

        const newNode: TreeNodeData = {
          id: newId,
          name: className,
          type: nodeType,
          children: [],
          position: [0, 5, 0],
          rotation: [0, 0, 0],
          size: [4, 4, 4],
          color: (nodeType === 'decal' || nodeType === 'texture') ? '#ffffff' : '#a3a2a5',
          // Default properties for decal / texture
          texture: (nodeType === 'decal' || nodeType === 'texture') ? '' : undefined,
          face: (nodeType === 'spotlight' || nodeType === 'surfacelight' || nodeType === 'decal' || nodeType === 'texture') ? 'Front' : undefined,
          transparency: (nodeType === 'decal' || nodeType === 'texture') ? 0 : undefined,
          studsPerTileU: nodeType === 'texture' ? 2 : undefined,
          studsPerTileV: nodeType === 'texture' ? 2 : undefined,
          offsetStudsU: nodeType === 'texture' ? 0 : undefined,
          offsetStudsV: nodeType === 'texture' ? 0 : undefined,
          // Default properties for light / effect objects
          range: nodeType.includes('light') ? 16 : undefined,
          lightBrightness: nodeType.includes('light') ? 1 : undefined,
          lightColor: nodeType.includes('light') ? '#ffffff' : undefined,
          shadows: nodeType.includes('light') ? false : undefined,
          angle: (nodeType === 'spotlight' || nodeType === 'surfacelight') ? 90 : undefined,
          enabled: true,
          sunAngularSize: nodeType === 'sky' ? 21 : undefined,
          moonAngularSize: nodeType === 'sky' ? 11 : undefined,
          celestialBodiesShown: nodeType === 'sky' ? true : undefined,
          starCount: nodeType === 'sky' ? 3000 : undefined,
          density: nodeType === 'atmosphere' ? 0.395 : undefined,
          offset: nodeType === 'atmosphere' ? 0.25 : undefined,
          decay: nodeType === 'atmosphere' ? '#6a5b4f' : undefined,
          glare: nodeType === 'atmosphere' ? 0 : undefined,
          haze: nodeType === 'atmosphere' ? 0 : undefined,
          contrast: nodeType === 'colorcorrectioneffect' ? 0 : undefined,
          saturation: nodeType === 'colorcorrectioneffect' ? 0 : undefined,
          tintColor: nodeType === 'colorcorrectioneffect' ? '#ffffff' : undefined,
          intensity: nodeType === 'bloomeffect' ? 1 : nodeType === 'sunrayseffect' ? 0.25 : undefined,
          threshold: nodeType === 'bloomeffect' ? 2 : undefined,
          spread: nodeType === 'sunrayseffect' ? 0.1 : undefined,
          effectSize: (nodeType === 'bloomeffect' || nodeType === 'blureffect') ? 24 : undefined,
        };

        updateTree((tree) => {
          const addChild = (nodes: TreeNodeData[]): TreeNodeData[] =>
            nodes.map((n) => {
              if (n.id === parentId) {
                return { ...n, children: [...n.children, newNode], expanded: true };
              }
              return { ...n, children: addChild(n.children) };
            });
          return addChild(tree);
        });

        return createInstanceProxy(newId, getTree, updateTree, onLog, bridge);
      });

      await this.engine.doString(`
        Instance = {
          new = function(className, parent)
            return __WRAP_INSTANCE(__CREATE_INSTANCE_RAW(className, parent))
          end
        }
        _G.Instance = Instance
      `);

      this.engine.global.set('__GET_SCRIPT_INSTANCE', (scriptId: string) => {
        return createInstanceProxy(scriptId, getTree, updateTree, onLog, bridge);
      });

      if (modules) {
        this.engine.global.set('require', (target: any) => {
          const modName = typeof target === 'string' ? target : target?.Name || '';
          if (modules[modName]) return this.engine!.doStringSync(modules[modName]);
          throw new Error(`ModuleScript '${modName}' not found`);
        });
      }

      // Inject Task Scheduler & Script Thread Runner
      await this.engine.doString(`
        _G.__THREADS = {}

        function wait(sec)
          return coroutine.yield("WAIT", tonumber(sec) or 0.03)
        end
        _G.wait = wait

        task = {
          wait = wait,
          spawn = function(f, ...)
            local co = type(f) == "thread" and f or coroutine.create(f)
            table.insert(_G.__THREADS, { co = co, resumeTime = 0, lastResume = 0, args = {...} })
            return co
          end,
          delay = function(sec, f, ...)
            local co = type(f) == "thread" and f or coroutine.create(f)
            local delaySec = tonumber(sec) or 0.03
            table.insert(_G.__THREADS, { co = co, resumeTime = 0 + (delaySec * 1000), lastResume = 0, args = {...} })
            return co
          end,
          defer = function(f, ...)
            local co = type(f) == "thread" and f or coroutine.create(f)
            table.insert(_G.__THREADS, { co = co, resumeTime = 0, lastResume = 0, args = {...} })
            return co
          end,
          cancel = function(co)
            for i = 1, #_G.__THREADS do
              if _G.__THREADS[i].co == co then
                table.remove(_G.__THREADS, i)
                break
              end
            end
          end
        }
        _G.task = task
        _G.spawn = task.spawn
        _G.delay = task.delay

        function __ADD_THREAD(scriptId, name, codeStr)
          local scriptProxy = __GET_SCRIPT_INSTANCE(scriptId)
          local env = setmetatable({
            script = __WRAP_INSTANCE(scriptProxy),
            Enum = _G.Enum or {
              Material = { Plastic = "Plastic", SmoothPlastic = "SmoothPlastic", Neon = "Neon", Wood = "Wood", Metal = "Metal", Glass = "Glass", Brick = "Brick", Concrete = "Concrete" },
              PartType = { Ball = "Ball", Block = "Block", Cylinder = "Cylinder", Wedge = "Wedge" },
              EasingStyle = { Linear = "Linear", Sine = "Sine", Back = "Back", Quad = "Quad", Cubic = "Cubic", Quart = "Quart", Quint = "Quint", Bounce = "Bounce", Elastic = "Elastic", Exponential = "Exponential", Circular = "Circular" },
              EasingDirection = { In = "In", Out = "Out", InOut = "InOut" },
              PlaybackState = { Begin = "Begin", Delayed = "Delayed", Playing = "Playing", Paused = "Paused", Completed = "Completed", Canceled = "Canceled" },
            },
            TweenInfo = _G.TweenInfo,
          }, { __index = _G })

          local fn, err = load(codeStr, "@" .. name, "t", env)
          if not fn then
            error("Syntax Error in " .. name .. ": " .. tostring(err))
          end
          local co = coroutine.create(fn)
          table.insert(_G.__THREADS, { co = co, resumeTime = 0, lastResume = 0, args = {} })
        end

        -- Channels fired since the previous __STEP call, populated by JS
        -- (see LuaRuntime.runLoop) immediately before invoking __STEP each
        -- tick. Each entry: { channel = "Heartbeat", args = { dt } }.
        _G.__RBX_PENDING_FIRES = {}

        function __STEP(now)
          local nextWake = math.huge
          local pendingFires = _G.__RBX_PENDING_FIRES
          _G.__RBX_PENDING_FIRES = {}

          local i = 1
          while i <= #_G.__THREADS do
            local t = _G.__THREADS[i]
            local shouldResume = false
            local resumeArgs = nil

            if t.waitChannel then
              -- Waiting on a signal (RunService.Heartbeat:Wait(), etc.)
              -- rather than a timer — only wakes if that channel fired.
              for _, fire in ipairs(pendingFires) do
                if fire.channel == t.waitChannel then
                  shouldResume = true
                  resumeArgs = fire.args
                  t.waitChannel = nil
                  break
                end
              end
              if not shouldResume then
                i = i + 1
                goto continue
              end
            elseif now >= t.resumeTime then
              shouldResume = true
              local dt = t.lastResume > 0 and ((now - t.lastResume) / 1000) or 0.03
              resumeArgs = t.args
              t.args = {}
              if #resumeArgs == 0 then
                resumeArgs = { dt }
              end
            end

            if shouldResume then
              t.lastResume = now
              local ok, action, arg = coroutine.resume(t.co, table.unpack(resumeArgs))
              if not ok then
                print("RUNTIME ERROR: " .. tostring(action))
                table.remove(_G.__THREADS, i)
              elseif coroutine.status(t.co) == 'dead' then
                table.remove(_G.__THREADS, i)
              else
                if action == "WAIT" then
                  local waitSec = tonumber(arg) or 0.03
                  t.resumeTime = now + (waitSec * 1000)
                elseif action == "RBXWAIT" then
                  t.waitChannel = arg
                  t.resumeTime = math.huge
                else
                  t.resumeTime = now
                end
                if t.resumeTime < nextWake then nextWake = t.resumeTime end
                i = i + 1
              end
            else
              if t.resumeTime < nextWake then nextWake = t.resumeTime end
              i = i + 1
            end
            ::continue::
          end
          return nextWake
        end

        function __RBX_MARK_FIRED(channel, ...)
          table.insert(_G.__RBX_PENDING_FIRES, { channel = channel, args = { ... } })
        end
        _G.__RBX_MARK_FIRED = __RBX_MARK_FIRED
      `);

      const addThread = this.engine.global.get('__ADD_THREAD');
      this.luaStepFn = this.engine.global.get('__STEP');
      this.markFiredFn = this.engine.global.get('__RBX_MARK_FIRED');

      for (const script of scripts) {
        try {
          addThread(script.id, script.name, script.code);
        } catch (e: any) {
          onLog('error', `${script.name}: ${e.message || e}`);
        }
      }

      this.lastFrameTime = Date.now();
      this.runLoop();
    } catch (err: any) {
      onLog('error', `Engine init error: ${err?.message || err}`);
      this.isRunning = false;
    }
  }

  // Frame cadence for RunService's continuous signals. Real Roblox ties
  // Heartbeat/Stepped to the physics step and RenderStepped to the render
  // loop; this simulation doesn't distinguish them and just fires all three
  // every ~1/60s so scripts that do `RunService.Heartbeat:Wait()` or
  // `:Connect(function(dt) ... end)` see steady per-frame updates.
  private runLoop = () => {
    if (!this.isRunning || !this.luaStepFn) return;

    try {
      const now = Date.now();
      const dt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60;
      this.lastFrameTime = now;

      // Fire the continuous RunService signals before stepping threads, so
      // any coroutine blocked on Heartbeat/Stepped/RenderStepped:Wait() (via
      // the "RBXWAIT" yield) sees them as pending this tick, and any
      // JS-side :Connect() listener gets called with the same dt.
      if (this.markFiredFn) {
        this.markFiredFn('Heartbeat', dt);
        this.markFiredFn('Stepped', now / 1000, dt);
        this.markFiredFn('RenderStepped', dt);
      }
      globalSignalHub.fire('Heartbeat', dt);
      globalSignalHub.fire('Stepped', now / 1000, dt);
      globalSignalHub.fire('RenderStepped', dt);

      const nextWake = this.luaStepFn(now);

      // Always keep ticking at the frame cadence while running — even if no
      // timers are pending — because RunService's signals must keep firing
      // for the lifetime of the Play session, not just until threads settle.
      if (!this.isRunning) return;
      const timeToNextTimer = nextWake === Infinity ? Infinity : Math.max(0, nextWake - Date.now());
      const waitTime = Math.max(0, Math.min(LuaRuntime.FRAME_INTERVAL_MS, timeToNextTimer));
      this.schedulerTimeout = setTimeout(this.runLoop, waitTime);
    } catch (err: any) {
      console.error('Scheduler error', err);
    }
  };

  stop() {
    this.isRunning = false;
    if (this.schedulerTimeout) clearTimeout(this.schedulerTimeout);
    globalSignalHub.reset();
    if (this.engine) {
      try {
        this.engine.global.close();
      } catch {}
      this.engine = null;
    }
  }
}
