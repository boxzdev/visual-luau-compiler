import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  FileCode, 
  Box, 
  Boxes,
  FileJson, 
  Globe, 
  Users, 
  Sun, 
  Layers, 
  ArrowRight, 
  Package, 
  Server, 
  HardDrive, 
  Layout, 
  Briefcase, 
  UserPlus, 
  Flag, 
  Volume2, 
  MessageSquare, 
  Camera, 
  Mountain, 
  Folder, 
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  MousePointer2,
  Move,
  Maximize,
  RotateCw,
  Monitor,
  Zap,
  ArrowLeftRight,
  Lightbulb,
  Sparkles,
  Cloud,
  Sliders,
  Eye,
  Flame,
  Moon,
  Image as ImageIcon,
  Grid
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Box as DreiBox, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { 
  LuaRuntime, 
  formatTimestamp, 
  LogEntry, 
  LogType, 
  TreeNodeData, 
  findNodeById, 
  globalRemoteBridge, 
  fireInstanceSignal, 
  LIGHTING_DEFAULTS, 
  calculateCelestialDirections,
  clockTimeToTimeOfDay,
  timeOfDayToClockTime,
  checkLuaSyntax,
  LuaSyntaxError
} from './luaRunner';
import { PropertiesPanel } from './PropertiesPanel';
import { globalPhysicsEngine } from './physicsEngine';
import { analyzeLuau, formatSyntaxErrorDiagnostic, LuauDiagnostic } from './luauLinter';
import sunAsset from '../R_Assets/Sun.png';
import moonAsset from '../R_Assets/Moon.png';

// ── Roblox Studio class & service icons (eagerly bundled) ──────────────
const classIconModules = import.meta.glob<{ default: string }>(
  '../R_Assets/Classes/*.png',
  { eager: true },
);
const serviceIconModules = import.meta.glob<{ default: string }>(
  '../R_Assets/Services/*.png',
  { eager: true },
);

const CLASS_ICONS: Record<string, string> = {};
for (const [path, mod] of Object.entries(classIconModules)) {
  const name = path.split('/').pop()?.replace('.png', '')?.toLowerCase();
  if (name) CLASS_ICONS[name] = mod.default;
}

const SERVICE_ICONS: Record<string, string> = {};
for (const [path, mod] of Object.entries(serviceIconModules)) {
  const name = path.split('/').pop()?.replace('.png', '')?.toLowerCase();
  if (name) SERVICE_ICONS[name] = mod.default;
}

/** Resolve a Roblox Studio icon URL by node name / type.  Returns `null`
 *  when no extracted icon exists so callers can fall back to Lucide. */
function getRobloxIconUrl(name: string, type?: string): string | null {
  const nameLower = name.toLowerCase();
  const typeLower = (type || '').toLowerCase();

  // 1. Service icons (matched by name)
  if (SERVICE_ICONS[nameLower]) return SERVICE_ICONS[nameLower];

  // 2. Map internal type strings to Roblox class names
  const TYPE_TO_CLASS: Record<string, string> = {
    object: 'part',
    part: 'part',
    folder_script: 'folder',
    folder: 'folder',
    spawnlocation: 'spawnlocation',
    script: 'script',
    localscript: 'localscript',
    modulescript: 'modulescript',
    remoteevent: 'remoteevent',
    remotefunction: 'remotefunction',
    camera: 'camera',
    terrain: 'terrain',
    model: 'model',
    decal: 'decal',
    texture: 'texture',
    pointlight: 'pointlight',
    spotlight: 'spotlight',
    surfacelight: 'surfacelight',
    sky: 'sky',
    atmosphere: 'atmosphere',
    colorcorrectioneffect: 'colorcorrectioneffect',
    bloomeffect: 'bloomeffect',
    sunrayseffect: 'sunrayseffect',
    blureffect: 'blureffect',
    depthoffieldeffect: 'depthoffieldeffect',
  };

  const mappedClass = TYPE_TO_CLASS[typeLower];
  if (mappedClass && CLASS_ICONS[mappedClass]) return CLASS_ICONS[mappedClass];

  // 3. Direct class lookup by type or name
  if (CLASS_ICONS[typeLower]) return CLASS_ICONS[typeLower];
  if (CLASS_ICONS[nameLower]) return CLASS_ICONS[nameLower];

  return null;
}

// Services whose contents never replicate down to the client — matches
// Roblox's real behavior for ServerScriptService / ServerStorage.
const NON_REPLICATED_SERVICE_IDS = new Set(['serverscriptservice', 'serverstorage']);

// Strip the contents of non-replicated services from a tree (used once,
// when a Play session starts, to seed the client's initial view).
function stripNonReplicated(nodes: TreeNodeData[]): TreeNodeData[] {
  return nodes.map((n) => {
    if (NON_REPLICATED_SERVICE_IDS.has(n.id)) {
      return { ...n, children: [] };
    }
    return { ...n, children: stripNonReplicated(n.children) };
  });
}

// Collect every node id present in a tree, skipping non-replicated subtrees.
function collectReplicableIds(nodes: TreeNodeData[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    out.add(n.id);
    if (!NON_REPLICATED_SERVICE_IDS.has(n.id)) {
      collectReplicableIds(n.children, out);
    }
  }
  return out;
}

// Merge the server's authoritative children into the client's children list:
//  - nodes that exist on the server are added/updated (server properties win)
//  - nodes that only exist on the client (created by a LocalScript) are kept as-is
//  - nodes that no longer exist on the server are removed from the client
function mergeReplicatedChildren(
  serverChildren: TreeNodeData[],
  clientChildren: TreeNodeData[],
  serverIdSet: Set<string>
): TreeNodeData[] {
  const clientById = new Map(clientChildren.map((c) => [c.id, c]));

  const merged = serverChildren.map((sNode) => {
    if (NON_REPLICATED_SERVICE_IDS.has(sNode.id)) {
      // Container itself is visible, its contents are not.
      return { ...sNode, children: [] };
    }
    const cNode = clientById.get(sNode.id);
    const { children: sChildren, ...sProps } = sNode;
    return {
      ...(cNode || {}),
      ...sProps,
      children: mergeReplicatedChildren(sChildren, cNode ? cNode.children : [], serverIdSet),
    } as TreeNodeData;
  });

  // Keep client-only nodes (never existed on the server at all) untouched.
  for (const cNode of clientChildren) {
    if (!serverIdSet.has(cNode.id)) {
      merged.push(cNode);
    }
  }

  return merged;
}

function replicateServerToClient(serverTree: TreeNodeData[], clientTree: TreeNodeData[]): TreeNodeData[] {
  const serverIdSet = collectReplicableIds(serverTree);
  return mergeReplicatedChildren(serverTree, clientTree, serverIdSet);
}

function StudioControls() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const speed = 30 * delta;
    
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    
    const move = new THREE.Vector3(0, 0, 0);
    if (keys.current['w']) move.add(forward);
    if (keys.current['s']) move.sub(forward);
    if (keys.current['d']) move.add(right);
    if (keys.current['a']) move.sub(right);
    if (keys.current['e']) move.y += 1;
    if (keys.current['q']) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      controlsRef.current.target.add(move);
    }
  });

  return <OrbitControls ref={controlsRef} makeDefault enablePan={true} enableZoom={true} />;
}

function PhysicsSimulator({
  isRunning,
  getTree,
  onPhysicsStep,
}: {
  isRunning: boolean;
  getTree: () => TreeNodeData[];
  onPhysicsStep: (updates: Map<string, { position: [number, number, number]; rotation: [number, number, number] }>) => void;
}) {
  const callbackRef = useRef(onPhysicsStep);
  callbackRef.current = onPhysicsStep;
  const getTreeRef = useRef(getTree);
  getTreeRef.current = getTree;

  useFrame((_, delta) => {
    if (!isRunning || !globalPhysicsEngine.isSimulating) return;

    globalPhysicsEngine.step(
      getTreeRef.current(),
      delta,
      (updates) => {
        callbackRef.current(updates);
      },
      (nodeId, otherNodeId, began) => {
        fireInstanceSignal(nodeId, began ? 'Touched' : 'TouchEnded', otherNodeId);
      }
    );
  });

  return null;
}

// Helper: SpotLight that aims in a given face direction
function SpotLightWithFace({
  direction,
  ...props
}: {
  direction: [number, number, number];
  color: string;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
  castShadow: boolean;
}) {
  const lightRef = useRef<THREE.SpotLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  }, []);

  useEffect(() => {
    if (targetRef.current) {
      // Place target along the direction vector, far enough away
      targetRef.current.position.set(
        direction[0] * 10,
        direction[1] * 10,
        direction[2] * 10
      );
      targetRef.current.updateMatrixWorld();
    }
  }, [direction[0], direction[1], direction[2]]);

  return (
    <group>
      <spotLight ref={lightRef} {...props} />
      <object3D ref={targetRef} position={[direction[0] * 10, direction[1] * 10, direction[2] * 10]} />
    </group>
  );
}

const assetUrlCache = new Map<string, string[]>();

// Bundled local assets that can be referenced by friendly name or filename
const BUNDLED_ASSETS: Record<string, string> = {
  'sun': sunAsset,
  'sun.png': sunAsset,
  'r_assets/sun.png': sunAsset,
  'moon': moonAsset,
  'moon.png': moonAsset,
  'r_assets/moon.png': moonAsset,
};

// Extracts a numeric Roblox asset ID from any common user input format:
// - Raw digits: "144075659"
// - Asset URI: "rbxassetid://144075659"
// - Thumb URI: "rbxthumb://type=Asset&id=144075659&w=420&h=420"
// - Catalog / Library / Store links: "https://www.roblox.com/catalog/144075659/face"
// - Asset query links: "http://www.roblox.com/asset/?id=144075659"
export function extractRobloxAssetId(input?: string): string | null {
  if (!input) return null;
  const raw = input.trim();

  // 1. Pure numeric ID (e.g. "144075659")
  if (/^\d+$/.test(raw)) {
    return raw;
  }

  // 2. rbxassetid://<id>
  const rbxAssetMatch = raw.match(/rbxassetid:\/\/(\d+)/i);
  if (rbxAssetMatch) return rbxAssetMatch[1];

  // 3. rbxthumb://...id=<id>
  const rbxThumbMatch = raw.match(/rbxthumb:\/\/.*?id=(\d+)/i);
  if (rbxThumbMatch) return rbxThumbMatch[1];

  // 4. roblox.com, roproxy.com, or rbxcdn.com asset URLs with query param ?id=<id> or &id=<id>
  const queryIdMatch = raw.match(/[?&]id=(\d+)/i);
  if (queryIdMatch && /(?:roblox\.com|roproxy\.com|rbxcdn\.com)/i.test(raw)) {
    return queryIdMatch[1];
  }

  // 5. Roblox website URLs: /catalog/<id>, /library/<id>, /asset/<id>, /store/asset/<id>, /marketplace/<id>
  const pathIdMatch = raw.match(/(?:catalog|library|asset|store\/asset|marketplace)\/(\d+)/i);
  if (pathIdMatch && /(?:roblox\.com|roproxy\.com)/i.test(raw)) {
    return pathIdMatch[1];
  }

  // 6. Generic asset/?id= even if domain is omitted
  const genericAssetMatch = raw.match(/asset\/\?id=(\d+)/i);
  if (genericAssetMatch) return genericAssetMatch[1];

  return null;
}

// Candidate image URLs for Three.js TextureLoader.
// Roblox CDN images (tr.rbxcdn.com and t*.rbxcdn.com) natively provide
// `Access-Control-Allow-Origin: *`, allowing WebGL to consume them directly.
// wsrv.nl is included as a resilient fallback in case of CORS or network blocks.
function buildImageCandidates(imageUrl: string): string[] {
  const candidates: string[] = [imageUrl];

  if (!imageUrl.startsWith('https://wsrv.nl') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
    candidates.push(`https://wsrv.nl/?${new URLSearchParams({ url: imageUrl }).toString()}`);
    candidates.push(`https://images.weserv.nl/?${new URLSearchParams({ url: imageUrl }).toString()}`);
  }

  return candidates;
}

// Resolves a Roblox asset thumbnail URL purely in the frontend without requiring
// any backend server or Cloudflare Worker deployment.
async function fetchRobloxThumbnail(assetId: string): Promise<string | null> {
  const queryParams = `v1/assets?assetIds=${assetId}&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false`;

  // Candidate lookup endpoints tried in order:
  const lookupUrls: string[] = [];

  // 1. Optional user-configured proxy (if VITE_THUMBNAIL_PROXY_URL is set in environment)
  const envProxy = (import.meta as any).env?.VITE_THUMBNAIL_PROXY_URL;
  if (envProxy && typeof envProxy === 'string' && envProxy.trim()) {
    const base = envProxy.trim().replace(/\/+$/, '');
    lookupUrls.push(`${base}/${queryParams}`);
  }

  // 2. Community Roblox reverse proxy: 100% frontend, CORS-enabled, public, free, fast
  lookupUrls.push(`https://thumbnails.roproxy.com/${queryParams}`);

  // 3. Vite development proxy (available in local dev mode via npm run dev)
  if ((import.meta as any).env?.DEV) {
    lookupUrls.push(`/api/roblox-thumbnail/${queryParams}`);
  }

  for (const url of lookupUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        const imgUrl = json?.data?.[0]?.imageUrl;
        if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
          return imgUrl;
        }
      }
    } catch {
      // Try next endpoint candidate
    }
  }

  // 4. Secondary fallback: query assetdelivery via roproxy (delivers the raw image or Decal XML)
  try {
    const deliveryRes = await fetch(`https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (deliveryRes.ok) {
      const contentType = deliveryRes.headers.get('content-type') || '';
      if (contentType.includes('image/') || deliveryRes.url.includes('rbxcdn.com')) {
        return deliveryRes.url;
      }
      // If it returned a Decal XML pointing to an inner Image ID: <url>...id=12345...</url>
      const text = await deliveryRes.text();
      const innerIdMatch = text.match(/[?&]id=(\d+)/i) || text.match(/<url>[^<]*?(\d+)[^<]*?<\/url>/i);
      if (innerIdMatch && innerIdMatch[1] && innerIdMatch[1] !== assetId) {
        const innerImg = await fetchRobloxThumbnail(innerIdMatch[1]);
        if (innerImg) return innerImg;
      }
    }
  } catch {
    // Ignore and proceed
  }

  return null;
}

// Returns an ordered list of URLs to try for this texture; the caller should
// attempt them in sequence and use the first one that successfully loads.
export async function resolveRobloxAssetUrl(input?: string): Promise<string[]> {
  if (!input || !input.trim()) return [];
  const raw = input.trim();

  if (assetUrlCache.has(raw)) {
    return assetUrlCache.get(raw)!;
  }

  // Map friendly aliases to Roblox asset IDs
  let lookup = raw;
  const lower = raw.toLowerCase();
  if (lower === 'grid' || lower === 'grid.png') {
    lookup = '6372755229';
  } else if (lower === 'spawnlocation' || lower === 'spawnlocation.png') {
    lookup = '3724740815';
  }

  // 1. Check bundled local assets (e.g. "Sun.png", "Moon.png")
  const localKey = lookup.toLowerCase();
  if (BUNDLED_ASSETS[localKey]) {
    const resolved = [BUNDLED_ASSETS[localKey]];
    assetUrlCache.set(raw, resolved);
    return resolved;
  }

  // 2. Data URLs, blobs, or relative paths
  if (/^(data:|blob:|\.\/|\/)/i.test(lookup)) {
    const resolved = [lookup];
    assetUrlCache.set(raw, resolved);
    return resolved;
  }

  // 3. Direct Roblox CDN image URL (which already sends Access-Control-Allow-Origin: *)
  if (/^https?:\/\/[a-z0-9-]+\.rbxcdn\.com\//i.test(lookup)) {
    const candidates = buildImageCandidates(lookup);
    assetUrlCache.set(raw, candidates);
    return candidates;
  }

  // 4. Extract Roblox numeric asset ID if input is an ID or Roblox link
  const assetId = extractRobloxAssetId(lookup);
  if (assetId) {
    const imgUrl = await fetchRobloxThumbnail(assetId);
    if (imgUrl) {
      const candidates = buildImageCandidates(imgUrl);
      assetUrlCache.set(raw, candidates);
      return candidates;
    }
    console.warn('Could not resolve Roblox thumbnail for asset ID', assetId, '- all frontend lookups failed.');
    return [];
  }

  // 5. Standard non-Roblox web image URL: provide direct URL with wsrv.nl CORS fallback
  if (/^https?:\/\//i.test(lookup)) {
    const candidates = buildImageCandidates(lookup);
    assetUrlCache.set(raw, candidates);
    return candidates;
  }

  // 6. Generic numeric sequence fallback
  const fallbackDigits = raw.match(/\d+/);
  if (fallbackDigits) {
    const imgUrl = await fetchRobloxThumbnail(fallbackDigits[0]);
    if (imgUrl) {
      const candidates = buildImageCandidates(imgUrl);
      assetUrlCache.set(raw, candidates);
      return candidates;
    }
  }

  return [raw];
}

function PartDecalOrTexture({
  node,
  parentSize,
}: {
  node: TreeNodeData;
  parentSize: [number, number, number];
}) {
  const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
  const [textureMap, setTextureMap] = useState<THREE.Texture | null>(null);

  const isTexture = node.type?.toLowerCase() === 'texture';
  const face = (node.face || 'Front').toLowerCase();

  const [sx, sy, sz] = parentSize;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;

  let faceWidth = sx;
  let faceHeight = sy;
  let facePos: [number, number, number] = [0, 0, -hz];
  let faceRot: [number, number, number] = [0, Math.PI, 0];

  const eps = 0.005;
  switch (face) {
    case 'back':
      faceWidth = sx;
      faceHeight = sy;
      facePos = [0, 0, hz + eps];
      faceRot = [0, 0, 0];
      break;
    case 'top':
      faceWidth = sx;
      faceHeight = sz;
      facePos = [0, hy + eps, 0];
      faceRot = [-Math.PI / 2, 0, 0];
      break;
    case 'bottom':
      faceWidth = sx;
      faceHeight = sz;
      facePos = [0, -hy - eps, 0];
      faceRot = [Math.PI / 2, 0, 0];
      break;
    case 'left':
      faceWidth = sz;
      faceHeight = sy;
      facePos = [-hx - eps, 0, 0];
      faceRot = [0, -Math.PI / 2, 0];
      break;
    case 'right':
      faceWidth = sz;
      faceHeight = sy;
      facePos = [hx + eps, 0, 0];
      faceRot = [0, Math.PI / 2, 0];
      break;
    case 'front':
    default:
      faceWidth = sx;
      faceHeight = sy;
      facePos = [0, 0, -hz - eps];
      faceRot = [0, Math.PI, 0];
      break;
  }

  useEffect(() => {
    let active = true;
    if (!node.texture) {
      setCandidateUrls([]);
      return;
    }
    resolveRobloxAssetUrl(node.texture).then((urls) => {
      if (active) setCandidateUrls(urls);
    });
    return () => {
      active = false;
    };
  }, [node.texture]);

  useEffect(() => {
    if (candidateUrls.length === 0) {
      setTextureMap(null);
      return;
    }
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const tryLoad = (index: number) => {
      if (index >= candidateUrls.length) {
        console.warn('PartDecalOrTexture: all candidate URLs failed to load for', node.texture);
        if (active) setTextureMap(null);
        return;
      }
      loader.load(
        candidateUrls[index],
        (tex) => {
          if (!active) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          setTextureMap(tex);
        },
        undefined,
        () => {
          if (!active) return;
          console.warn('PartDecalOrTexture: candidate failed, trying next:', candidateUrls[index]);
          tryLoad(index + 1);
        }
      );
    };

    tryLoad(0);
    return () => {
      active = false;
    };
  }, [candidateUrls]);

  const activeTexture = useMemo(() => {
    if (!textureMap) return null;
    const tex = textureMap.clone();
    if (isTexture) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      const tileU = Math.max(0.01, node.studsPerTileU ?? 2);
      const tileV = Math.max(0.01, node.studsPerTileV ?? 2);
      tex.repeat.set(faceWidth / tileU, faceHeight / tileV);
      tex.offset.set((node.offsetStudsU ?? 0) / tileU, (node.offsetStudsV ?? 0) / tileV);
    } else {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
      tex.offset.set(0, 0);
    }
    tex.needsUpdate = true;
    return tex;
  }, [
    textureMap,
    isTexture,
    node.studsPerTileU,
    node.studsPerTileV,
    node.offsetStudsU,
    node.offsetStudsV,
    faceWidth,
    faceHeight,
  ]);

  if (!activeTexture) return null;

  const transparency = node.transparency ?? 0;
  const opacity = Math.max(0, Math.min(1, 1 - transparency));

  return (
    <mesh position={facePos} rotation={faceRot}>
      <planeGeometry args={[faceWidth, faceHeight]} />
      <meshStandardMaterial
        map={activeTexture}
        color={node.color || '#ffffff'}
        transparent={true}
        opacity={opacity}
        roughness={0.8}
        metalness={0.1}
        polygonOffset={true}
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        side={THREE.FrontSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function DraggablePart({ 
  node, 
  isSelected, 
  activeTool,
  globalShadows = true,
  onClick, 
  onTransformChange 
}: { 
  node: TreeNodeData; 
  isSelected: boolean; 
  activeTool: 'select' | 'translate' | 'scale' | 'rotate';
  globalShadows?: boolean;
  onClick: () => void; 
  onTransformChange: (data: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }) => void 
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const controlsRef = useRef<any>(null);
  const callbackRef = useRef(onTransformChange);
  callbackRef.current = onTransformChange;
  
  // Default values based on type
  let defaultPos: [number, number, number] = [0, 5, 0];
  let defaultSize: [number, number, number] = [4, 4, 4];
  let defaultColor = '#a3a2a5';

  if (node.name.toLowerCase() === 'baseplate') {
    defaultPos = [0, -0.5, 0];
    defaultSize = [512, 1, 512];
    defaultColor = '#5B5B5B';
  } else if (node.type === 'spawnlocation' || node.name.toLowerCase() === 'spawnlocation') {
    defaultPos = [0, 0.5, 0];
    defaultSize = [12, 1, 12];
    defaultColor = '#e8e8e8';
  }

  const pos = node.position || defaultPos;
  const rot = node.rotation || [0, 0, 0];
  const scl = node.scale || [1, 1, 1];
  const size = node.size || defaultSize;
  const color = node.color || defaultColor;

  const isNeon = node.material === 'Neon';
  const isGlass = node.material === 'Glass';
  const isMetal = node.material === 'Metal' || node.material === 'CorrodedMetal' || node.material === 'DiamondPlate';
  const isSmooth = node.material === 'SmoothPlastic';
  const isFoil = node.material === 'Foil';

  const roughness = isNeon ? 0.1 : isGlass ? 0.05 : isMetal ? 0.25 : isSmooth ? 0.15 : isFoil ? 0.3 : 0.7;
  const metalness = isMetal ? 0.85 : isFoil ? 0.9 : 0.1;
  const emissive = isNeon ? color : '#000000';
  const emissiveIntensity = isNeon ? 0.8 : 0;
  const transparency = node.transparency ?? (isGlass ? 0.5 : 0);
  const opacity = Math.max(0, Math.min(1, 1 - transparency));
  const isTransparent = transparency > 0;

  const shape = node.shape || 'Block';

  const showGizmo = isSelected && activeTool !== 'select';

  // Save transform when dragging ends
  useEffect(() => {
    if (!showGizmo || !controlsRef.current) return;
    const controls = controlsRef.current;
    const onDragEnd = (event: { value: boolean }) => {
      if (event.value === false && meshRef.current) {
        const m = meshRef.current;
        callbackRef.current({
          position: [m.position.x, m.position.y, m.position.z],
          rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
          scale: [m.scale.x, m.scale.y, m.scale.z],
        });
      }
    };
    controls.addEventListener('dragging-changed', onDragEnd);
    return () => controls.removeEventListener('dragging-changed', onDragEnd);
  }, [showGizmo]);

  // Find child lights (PointLight, SpotLight, SurfaceLight)
  const childLights = (node.children || []).filter(
    (c) => ['pointlight', 'spotlight', 'surfacelight'].includes(c.type?.toLowerCase()) && c.enabled !== false
  );

  // Find child decals and textures
  const childDecalsAndTextures = (node.children || []).filter(
    (c) => ['decal', 'texture'].includes(c.type?.toLowerCase())
  );

  return (
    <>
      <mesh
        ref={meshRef}
        position={pos}
        rotation={rot}
        scale={scl}
        castShadow={node.castShadow !== false}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {shape === 'Ball' ? (
          <sphereGeometry args={[size[0] / 2, 32, 32]} />
        ) : shape === 'Cylinder' ? (
          <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
        ) : (
          <boxGeometry args={size} />
        )}
        <meshStandardMaterial 
          color={color} 
          roughness={roughness}
          metalness={metalness}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          transparent={isTransparent}
          opacity={opacity}
          depthWrite={!isTransparent}
          side={isTransparent ? THREE.DoubleSide : THREE.FrontSide}
        />

        {/* Dynamic child decals and textures attached to Part */}
        {childDecalsAndTextures.map((child) => (
          <PartDecalOrTexture key={child.id} node={child} parentSize={size} />
        ))}

        {/* Dynamic child lights attached inside Part */}
        {childLights.map((light) => {
          const lType = light.type?.toLowerCase();
          const lColor = light.lightColor || '#ffffff';
          const lBrightness = light.lightBrightness ?? 1;
          const lRange = light.range ?? 16;
          const lShadows = !!light.shadows && globalShadows;
          const lAngle = light.angle ?? 90;

          if (lType === 'spotlight' || lType === 'surfacelight') {
            // Map Face to direction vector for the spotlight
            const face = (light.face || 'Front').toLowerCase();
            let dir: [number, number, number] = [0, 0, -1]; // Front (default, -Z)
            if (face === 'back')   dir = [0, 0, 1];
            if (face === 'top')    dir = [0, 1, 0];
            if (face === 'bottom') dir = [0, -1, 0];
            if (face === 'left')   dir = [-1, 0, 0];
            if (face === 'right')  dir = [1, 0, 0];

            return (
              <SpotLightWithFace
                key={light.id}
                color={lColor}
                intensity={lBrightness * 14}
                distance={lRange}
                angle={((lAngle * Math.PI) / 360)}
                penumbra={0.35}
                castShadow={lShadows}
                direction={dir}
              />
            );
          }
          return (
            <pointLight
              key={light.id}
              color={lColor}
              intensity={lBrightness * 12}
              distance={lRange}
              decay={2}
              castShadow={lShadows}
            />
          );
        })}
      </mesh>

      {showGizmo && (
        <TransformControls
          ref={controlsRef}
          object={meshRef.current || undefined}
          mode={activeTool}
        />
      )}
    </>
  );
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = (hex || '#000000').replace('#', '').padEnd(6, '0');
    return [
      parseInt(h.substring(0, 2), 16) || 0,
      parseInt(h.substring(2, 4), 16) || 0,
      parseInt(h.substring(4, 6), 16) || 0,
    ];
  };
  const A = parse(a);
  const B = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(A[0] + (B[0] - A[0]) * k);
  const g = Math.round(A[1] + (B[1] - A[1]) * k);
  const bCol = Math.round(A[2] + (B[2] - A[2]) * k);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bCol.toString(16).padStart(2, '0')}`;
}

// Roblox-style sky dome with dynamic atmospheric haze, distant celestial
// sprites, and twinkling stars at night.
function RobloxSkyDome({
  clockTime,
  latitude,
  sunAngle,
  colorShiftTop,
  fogColor,
  fogEnabled,
  skyNode,
  atmosphereNode,
}: {
  clockTime: number;
  latitude: number;
  sunAngle: number;
  colorShiftTop: string;
  fogColor: string;
  fogEnabled: boolean;
  skyNode?: TreeNodeData;
  atmosphereNode?: TreeNodeData;
}) {
  const { scene, camera } = useThree();
  const sunTexture = useLoader(THREE.TextureLoader, sunAsset);
  const moonTexture = useLoader(THREE.TextureLoader, moonAsset);
  const skyObjectsGroupRef = useRef<THREE.Group>(null);
  const { sunDirection, moonDirection, elevation } = calculateCelestialDirections(clockTime, latitude, sunAngle);

  useFrame(() => {
    if (skyObjectsGroupRef.current) {
      skyObjectsGroupRef.current.position.copy(camera.position);
    }
  });

  const t = ((clockTime % 24) + 24) % 24;
  const dayFactor = Math.max(0, Math.min(1, (elevation + 0.05) / 0.25));

  let zenithColor = '#060914';
  let horizonColor = '#0d182b';
  let sunDiskColor = '#fff7e6';
  const sunDiskSize = skyNode?.sunAngularSize ?? 21;
  const moonDiskSize = skyNode?.moonAngularSize ?? 11;
  const showCelestial = skyNode?.celestialBodiesShown !== false;

  if (t >= 5 && t < 7) {
    const k = (t - 5) / 2;
    zenithColor = mixHex('#060914', '#2d4d8a', k);
    horizonColor = mixHex('#0d182b', '#ff9843', k);
    sunDiskColor = mixHex('#ff7226', '#ffc477', k);
  } else if (t >= 7 && t < 9) {
    const k = (t - 7) / 2;
    zenithColor = mixHex('#2d4d8a', '#73859c', k);
    horizonColor = mixHex('#ff9843', '#69768d', k);
    sunDiskColor = mixHex('#ffc477', '#fff7e6', k);
  } else if (t >= 9 && t < 16.5) {
    zenithColor = '#73859c';
    horizonColor = '#69768d';
    sunDiskColor = '#fffbf0';
  } else if (t >= 16.5 && t < 18.5) {
    const k = (t - 16.5) / 2;
    zenithColor = mixHex('#73859c', '#4a2559', k);
    horizonColor = mixHex('#69768d', '#ff5f2e', k);
    sunDiskColor = mixHex('#fffbf0', '#ff8438', k);
  } else if (t >= 18.5 && t < 20.5) {
    const k = (t - 18.5) / 2;
    zenithColor = mixHex('#4a2559', '#060914', k);
    horizonColor = mixHex('#ff5f2e', '#0d182b', k);
    sunDiskColor = '#ff6020';
  }

  // Apply Atmosphere effect properties
  if (atmosphereNode) {
    if (atmosphereNode.haze && atmosphereNode.haze > 0) {
      horizonColor = mixHex(horizonColor, '#d0d8e2', Math.min(0.6, atmosphereNode.haze * 0.1));
    }
    if (atmosphereNode.decay && atmosphereNode.decay !== '#000000') {
      horizonColor = mixHex(horizonColor, atmosphereNode.decay, 0.25);
    }
  }

  // Apply ColorShift_Top
  if (colorShiftTop && colorShiftTop.toLowerCase() !== '#000000') {
    zenithColor = mixHex(zenithColor, colorShiftTop, 0.25);
    horizonColor = mixHex(horizonColor, colorShiftTop, 0.15);
  }

  // Create equirectangular sky gradient background
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, zenithColor);
      grad.addColorStop(0.55, mixHex(zenithColor, horizonColor, 0.6));
      grad.addColorStop(1, horizonColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = texture;
    }
    return () => {
      scene.background = null;
    };
  }, [scene, zenithColor, horizonColor]);

  // Starfield positions
  const starData = useRef<{ positions: Float32Array } | null>(null);
  if (!starData.current) {
    const count = 1200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 380;
      const sinPhi = Math.sin(phi);
      pos[i * 3] = r * sinPhi * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
      pos[i * 3 + 2] = r * sinPhi * Math.sin(theta);
    }
    starData.current = { positions: pos };
  }

  const starOpacity = Math.max(0, Math.min(1, 1 - dayFactor * 1.5));

  const sunDist = 360;
  const sunPos: [number, number, number] = [
    sunDirection[0] * sunDist,
    sunDirection[1] * sunDist,
    sunDirection[2] * sunDist,
  ];

  const moonDist = 360;
  const moonPos: [number, number, number] = [
    moonDirection[0] * moonDist,
    moonDirection[1] * moonDist,
    moonDirection[2] * moonDist,
  ];

  const isSunVisible = showCelestial && sunPos[1] > -30;
  const isMoonVisible = showCelestial && moonPos[1] > -30;

  return (
    <>
      {/* Keep the stars, sun, and moon together in the camera-relative skybox layer. */}
      <group ref={skyObjectsGroupRef}>
        {starOpacity > 0.01 && (
          <points>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[starData.current.positions, 3]}
              />
            </bufferGeometry>
            <pointsMaterial
              size={2.2}
              color="#ffffff"
              transparent
              opacity={starOpacity * 0.9}
              sizeAttenuation={false}
            />
          </points>
        )}

            {isSunVisible && (
              <sprite position={sunPos} renderOrder={2} scale={[sunDiskSize * 1.4, sunDiskSize * 1.4, 1]}>
                <spriteMaterial
                  map={sunTexture}
                  color={sunDiskColor}
                  transparent
                  opacity={Math.max(0.2, dayFactor)}
                  depthWrite={false}
                />
              </sprite>
            )}

            {isMoonVisible && (
              <sprite position={moonPos} renderOrder={2} scale={[moonDiskSize * 1.6, moonDiskSize * 1.6, 1]}>
                <spriteMaterial
                  map={moonTexture}
                  transparent
                  opacity={Math.max(0.35, 1 - dayFactor)}
                  depthWrite={false}
                />
              </sprite>
            )}
          </group>
    </>
  );
}

function SceneLighting({ 
  node,
}: { 
  node: TreeNodeData | undefined;
}) {
  const { scene, gl } = useThree();
  const brightness = node?.brightness ?? LIGHTING_DEFAULTS.brightness;
  const ambient = node?.ambientColor || LIGHTING_DEFAULTS.ambientColor;
  const outdoorAmbient = node?.outdoorAmbient || LIGHTING_DEFAULTS.outdoorAmbient;
  const colorShiftTop = node?.colorShiftTop || LIGHTING_DEFAULTS.colorShiftTop;
  const colorShiftBottom = node?.colorShiftBottom || LIGHTING_DEFAULTS.colorShiftBottom;
  const clockTime = node?.clockTime ?? LIGHTING_DEFAULTS.clockTime;
  const latitude = node?.geographicLatitude ?? LIGHTING_DEFAULTS.geographicLatitude;
  const fogColor = node?.fogColor || LIGHTING_DEFAULTS.fogColor;
  const fogStart = node?.fogStart ?? LIGHTING_DEFAULTS.fogStart;
  const fogEnd = node?.fogEnd ?? LIGHTING_DEFAULTS.fogEnd;
  const globalShadows = node?.globalShadows !== false;
  const shadowSoftness = node?.shadowSoftness ?? LIGHTING_DEFAULTS.shadowSoftness;
  const exposure = node?.exposureCompensation ?? LIGHTING_DEFAULTS.exposureCompensation;
  const envDiffuse = node?.environmentDiffuseScale ?? LIGHTING_DEFAULTS.environmentDiffuseScale;
  const envSpecular = node?.environmentSpecularScale ?? LIGHTING_DEFAULTS.environmentSpecularScale;
  const skyEnabled = node?.skyEnabled !== false;
  const fogEnabled = node?.fogEnabled !== false;
  const ambientIntensity = node?.ambientIntensity ?? LIGHTING_DEFAULTS.ambientIntensity;
  const sunAngle = node?.sunAngle ?? LIGHTING_DEFAULTS.sunAngle;

  // Find effect children under lighting
  const lightingChildren = node?.children || [];
  const skyNode = lightingChildren.find((c) => c.type?.toLowerCase() === 'sky');
  const atmosphereNode = lightingChildren.find((c) => c.type?.toLowerCase() === 'atmosphere');
  const colorCorrectionNode = lightingChildren.find(
    (c) => c.type?.toLowerCase() === 'colorcorrectioneffect' && c.enabled !== false
  );

  const { sunDirection, moonDirection, elevation } = calculateCelestialDirections(clockTime, latitude, sunAngle);
  const dayFactor = Math.max(0, Math.min(1, (elevation + 0.05) / 0.25));

  const isDay = elevation > -0.05;
  const mainDir = isDay ? sunDirection : moonDirection;
  const lightDist = 60;
  const dirLightPos: [number, number, number] = [
    mainDir[0] * lightDist,
    Math.max(2, mainDir[1] * lightDist),
    mainDir[2] * lightDist,
  ];

  const rawSunColor = mixHex('#fff7e6', '#ff8438', Math.max(0, 1 - dayFactor));
  const sunLightColor = colorShiftTop && colorShiftTop.toLowerCase() !== '#000000'
    ? mixHex(rawSunColor, colorShiftTop, 0.4)
    : rawSunColor;

  const rawMoonColor = '#9ab4db';
  const moonLightColor = colorShiftTop && colorShiftTop.toLowerCase() !== '#000000'
    ? mixHex(rawMoonColor, colorShiftTop, 0.3)
    : rawMoonColor;

  const mainLightColor = isDay ? sunLightColor : moonLightColor;
  const mainLightIntensity = isDay
    ? Math.max(0.05, dayFactor) * brightness * (0.65 + envSpecular * 0.35)
    : 0.22 * brightness * ambientIntensity * (0.6 + envSpecular * 0.4);

  const skyAmbientColor = isDay ? '#73859c' : '#141e30';
  const hemiSky = colorShiftTop && colorShiftTop.toLowerCase() !== '#000000'
    ? mixHex(skyAmbientColor, colorShiftTop, 0.3)
    : skyAmbientColor;

  const hemiGround = colorShiftBottom && colorShiftBottom.toLowerCase() !== '#000000'
    ? mixHex(outdoorAmbient, colorShiftBottom, 0.4)
    : outdoorAmbient;

  const totalExposure = exposure + (colorCorrectionNode?.brightness ?? 0);

  useEffect(() => {
    const far = Math.max(fogStart + 1, fogEnd);
    scene.fog = fogEnabled && fogEnd < 99999 ? new THREE.Fog(fogColor, fogStart, far) : null;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = Math.pow(2, totalExposure);
    return () => {
      scene.fog = null;
    };
  }, [scene, gl, fogColor, fogEnabled, fogStart, fogEnd, totalExposure]);

  return (
    <>
      {skyEnabled && (
        <RobloxSkyDome
          clockTime={clockTime}
          latitude={latitude}
          sunAngle={sunAngle}
          colorShiftTop={colorShiftTop}
          fogColor={fogColor}
          fogEnabled={fogEnabled}
          skyNode={skyNode}
          atmosphereNode={atmosphereNode}
        />
      )}

      {/* Minimum ambient light (shadow / indoor light) */}
      <ambientLight color={ambient} intensity={(0.15 + envDiffuse * 0.35) * ambientIntensity} />

      {/* Hemisphere outdoor ambient bounce */}
      <hemisphereLight args={[hemiSky, hemiGround, (0.3 + envDiffuse * 0.5) * ambientIntensity]} />

      {/* Primary directional celestial light (Sun by day, Moon by night) */}
      <directionalLight
        color={mainLightColor}
        position={dirLightPos}
        intensity={mainLightIntensity}
        castShadow={globalShadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={160}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0004}
        shadow-radius={Math.max(1, shadowSoftness * 12)}
        shadow-blurSamples={8}
      />
    </>
  );
}

type TabItem = {
  id: string;
  name: string;
  type: 'viewport' | 'script' | 'localscript' | 'modulescript';
};

const initialTree: TreeNodeData[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    type: 'service',
    expanded: true,
    children: [
      { id: 'camera', name: 'Camera', type: 'camera', children: [] },
      { id: 'terrain', name: 'Terrain', type: 'terrain', children: [] },
      {
        id: 'spawnlocation',
        name: 'SpawnLocation',
        type: 'spawnlocation',
        color: '#e8e8e8',
        expanded: true,
        children: [
          {
            id: 'spawnlocation_decal',
            name: 'Decal',
            type: 'decal',
            texture: '3724740815',
            face: 'Top',
            transparency: 0,
            color: '#ffffff',
            children: [],
          },
        ],
      },
      {
        id: 'baseplate',
        name: 'Baseplate',
        type: 'object',
        color: '#5B5B5B',
        expanded: true,
        children: [
          {
            id: 'baseplate_texture',
            name: 'Texture',
            type: 'texture',
            texture: '6372755229',
            face: 'Top',
            studsPerTileU: 16,
            studsPerTileV: 16,
            transparency: 0.8,
            color: '#ffffff',
            children: [],
          },
        ],
      },
    ],
  },
  { id: 'players', name: 'Players', type: 'service', children: [] },
  {
    id: 'lighting',
    name: 'Lighting',
    type: 'service',
    children: [],
    ambientColor: LIGHTING_DEFAULTS.ambientColor,
    outdoorAmbient: LIGHTING_DEFAULTS.outdoorAmbient,
    brightness: LIGHTING_DEFAULTS.brightness,
    colorShiftTop: LIGHTING_DEFAULTS.colorShiftTop,
    colorShiftBottom: LIGHTING_DEFAULTS.colorShiftBottom,
    clockTime: LIGHTING_DEFAULTS.clockTime,
    geographicLatitude: LIGHTING_DEFAULTS.geographicLatitude,
    fogColor: LIGHTING_DEFAULTS.fogColor,
    fogStart: LIGHTING_DEFAULTS.fogStart,
    fogEnd: LIGHTING_DEFAULTS.fogEnd,
    shadowSoftness: LIGHTING_DEFAULTS.shadowSoftness,
    globalShadows: LIGHTING_DEFAULTS.globalShadows,
    exposureCompensation: LIGHTING_DEFAULTS.exposureCompensation,
    environmentDiffuseScale: LIGHTING_DEFAULTS.environmentDiffuseScale,
    environmentSpecularScale: LIGHTING_DEFAULTS.environmentSpecularScale,
    skyEnabled: LIGHTING_DEFAULTS.skyEnabled,
    fogEnabled: LIGHTING_DEFAULTS.fogEnabled,
    ambientIntensity: LIGHTING_DEFAULTS.ambientIntensity,
    sunAngle: LIGHTING_DEFAULTS.sunAngle,
  },
  { id: 'materialservice', name: 'MaterialService', type: 'service', children: [] },
  { id: 'replicatedfirst', name: 'ReplicatedFirst', type: 'service', children: [] },
  { id: 'replicatedstorage', name: 'ReplicatedStorage', type: 'service', children: [] },
  { id: 'serverscriptservice', name: 'ServerScriptService', type: 'service', children: [] },
  { id: 'serverstorage', name: 'ServerStorage', type: 'service', children: [] },
  { id: 'startergui', name: 'StarterGui', type: 'service', children: [] },
  { id: 'starterpack', name: 'StarterPack', type: 'service', children: [] },
  { 
    id: 'starterplayer', 
    name: 'StarterPlayer', 
    type: 'service', 
    expanded: true,
    children: [
      { id: 'startercharacterscripts', name: 'StarterCharacterScripts', type: 'folder_script', children: [] },
      { id: 'starterplayerscripts', name: 'StarterPlayerScripts', type: 'folder_script', children: [] }
    ] 
  },
  { id: 'teams', name: 'Teams', type: 'service', children: [] },
  { id: 'soundservice', name: 'SoundService', type: 'service', children: [] },
  { id: 'textchatservice', name: 'TextChatService', type: 'service', children: [] },
];

const initialDefaultScripts: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Roblox / Luau autocomplete data
// ---------------------------------------------------------------------------

const LUAU_KEYWORDS = [
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
  'true', 'until', 'while', 'continue',
];

// [label, insertText snippet, detail]
const GLOBAL_FUNCTIONS: Array<[string, string, string]> = [
  ['print', 'print(${1:...})', 'print(...) — output to console'],
  ['warn', 'warn(${1:...})', 'warn(...) — output a warning to console'],
  ['error', 'error(${1:message})', 'error(message, level?) — raise an error'],
  ['assert', 'assert(${1:value}, ${2:message})', 'assert(value, message?)'],
  ['pcall', 'pcall(${1:fn})', 'pcall(f, ...) — protected call'],
  ['xpcall', 'xpcall(${1:fn}, ${2:handler})', 'xpcall(f, err, ...)'],
  ['ipairs', 'ipairs(${1:table})', 'ipairs(t) — iterate array part'],
  ['pairs', 'pairs(${1:table})', 'pairs(t) — iterate all keys'],
  ['next', 'next(${1:table})', 'next(t, key?)'],
  ['select', 'select(${1:index})', 'select(#, ...) or select(n, ...)'],
  ['tostring', 'tostring(${1:value})', 'tostring(v)'],
  ['tonumber', 'tonumber(${1:value})', 'tonumber(v, base?)'],
  ['type', 'type(${1:value})', 'type(v) — Lua base type'],
  ['typeof', 'typeof(${1:value})', 'typeof(v) — Roblox-precise type (e.g. "Vector3")'],
  ['unpack', 'unpack(${1:table})', 'unpack(t) (use table.unpack in Luau)'],
  ['rawequal', 'rawequal(${1:a}, ${2:b})', 'rawequal(a, b)'],
  ['rawget', 'rawget(${1:table}, ${2:key})', 'rawget(t, k)'],
  ['rawset', 'rawset(${1:table}, ${2:key}, ${3:value})', 'rawset(t, k, v)'],
  ['setmetatable', 'setmetatable(${1:table}, ${2:meta})', 'setmetatable(t, mt)'],
  ['getmetatable', 'getmetatable(${1:table})', 'getmetatable(t)'],
  ['require', 'require(${1:module})', 'require(moduleScript)'],
  ['tick', 'tick()', 'tick() — seconds since epoch'],
  ['DateTime', 'DateTime', 'DateTime — date/time utility class'],
  ['game', 'game', 'The DataModel — root of the game tree'],
  ['workspace', 'workspace', 'The Workspace service'],
  ['script', 'script', 'The Script/LocalScript instance running this code'],
  ['shared', 'shared', 'Table shared across all scripts (rarely used)'],
  ['_G', '_G', 'Global table shared across scripts in the same context'],
];

// namespace -> [label, insertText, detail][]
const LIBRARY_MEMBERS: Record<string, Array<[string, string, string]>> = {
  task: [
    ['wait', 'wait(${1:seconds})', 'task.wait(seconds?) — yields, more accurate than legacy wait()'],
    ['spawn', 'spawn(function()\n\t$1\nend)', 'task.spawn(fn, ...) — run immediately on a new thread'],
    ['delay', 'delay(${1:seconds}, function()\n\t$2\nend)', 'task.delay(seconds, fn, ...)'],
    ['defer', 'defer(function()\n\t$1\nend)', 'task.defer(fn, ...) — runs after current resumption cycle'],
    ['cancel', 'cancel(${1:thread})', 'task.cancel(thread)'],
  ],
  string: [
    ['format', 'format(${1:"%s"}, ${2:...})', 'string.format(fmt, ...)'],
    ['sub', 'sub(${1:s}, ${2:i}, ${3:j})', 'string.sub(s, i, j?)'],
    ['gsub', 'gsub(${1:s}, ${2:pattern}, ${3:repl})', 'string.gsub(s, pattern, repl, n?)'],
    ['gmatch', 'gmatch(${1:s}, ${2:pattern})', 'string.gmatch(s, pattern)'],
    ['find', 'find(${1:s}, ${2:pattern})', 'string.find(s, pattern, init?, plain?)'],
    ['match', 'match(${1:s}, ${2:pattern})', 'string.match(s, pattern, init?)'],
    ['len', 'len(${1:s})', 'string.len(s)'],
    ['upper', 'upper(${1:s})', 'string.upper(s)'],
    ['lower', 'lower(${1:s})', 'string.lower(s)'],
    ['rep', 'rep(${1:s}, ${2:n})', 'string.rep(s, n)'],
    ['byte', 'byte(${1:s})', 'string.byte(s, i?, j?)'],
    ['char', 'char(${1:code})', 'string.char(...)'],
    ['split', 'split(${1:s}, ${2:","})', 'string.split(s, separator?) — Roblox extension'],
    ['reverse', 'reverse(${1:s})', 'string.reverse(s)'],
  ],
  table: [
    ['insert', 'insert(${1:table}, ${2:value})', 'table.insert(t, [pos,] value)'],
    ['remove', 'remove(${1:table}, ${2:pos})', 'table.remove(t, pos?)'],
    ['concat', 'concat(${1:table}, ${2:", "})', 'table.concat(t, sep?, i?, j?)'],
    ['sort', 'sort(${1:table})', 'table.sort(t, comp?)'],
    ['find', 'find(${1:table}, ${2:value})', 'table.find(t, value) — Roblox extension'],
    ['unpack', 'unpack(${1:table})', 'table.unpack(t, i?, j?)'],
    ['pack', 'pack(${1:...})', 'table.pack(...)'],
    ['clone', 'clone(${1:table})', 'table.clone(t) — Roblox extension'],
    ['freeze', 'freeze(${1:table})', 'table.freeze(t) — Roblox extension'],
    ['create', 'create(${1:count}, ${2:value})', 'table.create(count, value?) — Roblox extension'],
  ],
  math: [
    ['random', 'random(${1:min}, ${2:max})', 'math.random(m?, n?)'],
    ['randomseed', 'randomseed(${1:seed})', 'math.randomseed(x)'],
    ['floor', 'floor(${1:x})', 'math.floor(x)'],
    ['ceil', 'ceil(${1:x})', 'math.ceil(x)'],
    ['abs', 'abs(${1:x})', 'math.abs(x)'],
    ['min', 'min(${1:...})', 'math.min(...)'],
    ['max', 'max(${1:...})', 'math.max(...)'],
    ['clamp', 'clamp(${1:x}, ${2:min}, ${3:max})', 'math.clamp(x, min, max) — Roblox extension'],
    ['sign', 'sign(${1:x})', 'math.sign(x) — Roblox extension'],
    ['noise', 'noise(${1:x}, ${2:y}, ${3:z})', 'math.noise(x, y?, z?) — Perlin noise'],
    ['sqrt', 'sqrt(${1:x})', 'math.sqrt(x)'],
    ['huge', 'huge', 'math.huge — infinity'],
    ['pi', 'pi', 'math.pi'],
  ],
  os: [
    ['time', 'time()', 'os.time()'],
    ['clock', 'clock()', 'os.clock()'],
    ['date', 'date(${1:"*t"})', 'os.date(format?, time?)'],
    ['difftime', 'difftime(${1:t2}, ${2:t1})', 'os.difftime(t2, t1)'],
  ],
  coroutine: [
    ['create', 'create(${1:fn})', 'coroutine.create(f)'],
    ['resume', 'resume(${1:co})', 'coroutine.resume(co, ...)'],
    ['yield', 'yield(${1:...})', 'coroutine.yield(...)'],
    ['wrap', 'wrap(${1:fn})', 'coroutine.wrap(f)'],
    ['status', 'status(${1:co})', 'coroutine.status(co)'],
    ['isyieldable', 'isyieldable()', 'coroutine.isyieldable()'],
  ],
  bit32: [
    ['band', 'band(${1:...})', 'bit32.band(...)'],
    ['bor', 'bor(${1:...})', 'bit32.bor(...)'],
    ['bxor', 'bxor(${1:...})', 'bit32.bxor(...)'],
    ['bnot', 'bnot(${1:x})', 'bit32.bnot(x)'],
    ['lshift', 'lshift(${1:x}, ${2:n})', 'bit32.lshift(x, n)'],
    ['rshift', 'rshift(${1:x}, ${2:n})', 'bit32.rshift(x, n)'],
  ],
  utf8: [
    ['char', 'char(${1:code})', 'utf8.char(...)'],
    ['codepoint', 'codepoint(${1:s})', 'utf8.codepoint(s, i?, j?)'],
    ['len', 'len(${1:s})', 'utf8.len(s)'],
    ['offset', 'offset(${1:s}, ${2:n})', 'utf8.offset(s, n, i?)'],
  ],
};

// [label, insertText snippet, detail]
const DATATYPE_CONSTRUCTORS: Array<[string, string, string]> = [
  ['Instance.new', 'Instance.new("${1:ClassName}", ${2:parent})', 'Instance.new(className, parent?)'],
  ['Vector3.new', 'Vector3.new(${1:x}, ${2:y}, ${3:z})', 'Vector3.new(x, y, z)'],
  ['Vector2.new', 'Vector2.new(${1:x}, ${2:y})', 'Vector2.new(x, y)'],
  ['CFrame.new', 'CFrame.new(${1:x}, ${2:y}, ${3:z})', 'CFrame.new(x, y, z)'],
  ['CFrame.Angles', 'CFrame.Angles(${1:rx}, ${2:ry}, ${3:rz})', 'CFrame.Angles(rx, ry, rz) — radians'],
  ['CFrame.lookAt', 'CFrame.lookAt(${1:eye}, ${2:target})', 'CFrame.lookAt(eye, target)'],
  ['Color3.new', 'Color3.new(${1:r}, ${2:g}, ${3:b})', 'Color3.new(r, g, b) — 0 to 1 range'],
  ['Color3.fromRGB', 'Color3.fromRGB(${1:r}, ${2:g}, ${3:b})', 'Color3.fromRGB(r, g, b) — 0 to 255 range'],
  ['Color3.fromHSV', 'Color3.fromHSV(${1:h}, ${2:s}, ${3:v})', 'Color3.fromHSV(h, s, v)'],
  ['UDim.new', 'UDim.new(${1:scale}, ${2:offset})', 'UDim.new(scale, offset)'],
  ['UDim2.new', 'UDim2.new(${1:xScale}, ${2:xOffset}, ${3:yScale}, ${4:yOffset})', 'UDim2.new(xScale, xOffset, yScale, yOffset)'],
  ['UDim2.fromScale', 'UDim2.fromScale(${1:x}, ${2:y})', 'UDim2.fromScale(x, y)'],
  ['UDim2.fromOffset', 'UDim2.fromOffset(${1:x}, ${2:y})', 'UDim2.fromOffset(x, y)'],
  ['BrickColor.new', 'BrickColor.new("${1:Bright red}")', 'BrickColor.new(name)'],
  ['Ray.new', 'Ray.new(${1:origin}, ${2:direction})', 'Ray.new(origin, direction)'],
  ['Region3.new', 'Region3.new(${1:min}, ${2:max})', 'Region3.new(min, max)'],
  ['TweenInfo.new', 'TweenInfo.new(${1:time}, Enum.EasingStyle.${2:Quad}, Enum.EasingDirection.${3:Out})', 'TweenInfo.new(time, style, direction, repeat?, reverses?, delay?)'],
  ['NumberSequence.new', 'NumberSequence.new(${1:value})', 'NumberSequence.new(value) or (n0, n1)'],
  ['NumberRange.new', 'NumberRange.new(${1:min}, ${2:max})', 'NumberRange.new(min, max?)'],
  ['ColorSequence.new', 'ColorSequence.new(${1:color})', 'ColorSequence.new(color)'],
  ['Rect.new', 'Rect.new(${1:minX}, ${2:minY}, ${3:maxX}, ${4:maxY})', 'Rect.new(minX, minY, maxX, maxY)'],
  ['PhysicalProperties.new', 'PhysicalProperties.new(${1:density}, ${2:friction}, ${3:elasticity})', 'PhysicalProperties.new(density, friction, elasticity, ...)'],
];

const ROBLOX_SERVICES = [
  'Workspace', 'Players', 'Lighting', 'ReplicatedStorage', 'ReplicatedFirst',
  'ServerStorage', 'ServerScriptService', 'StarterGui', 'StarterPack',
  'StarterPlayer', 'SoundService', 'TweenService', 'RunService',
  'UserInputService', 'ContextActionService', 'Debris', 'PathfindingService',
  'MarketplaceService', 'DataStoreService', 'HttpService', 'TeleportService',
  'BadgeService', 'GroupService', 'InsertService', 'PolicyService',
  'ProximityPromptService', 'CollectionService', 'PhysicsService',
  'TextService', 'ChatService', 'MessagingService', 'VRService', 'GuiService',
  'Teams', 'PointsService', 'LocalizationService', 'AssetService',
  'AnalyticsService', 'TextChatService',
];

// [label, insertText snippet, detail]
const INSTANCE_METHODS: Array<[string, string, string]> = [
  ['GetService', 'GetService("${1:ServiceName}")', 'game:GetService(name) — fetch a service'],
  ['FindFirstChild', 'FindFirstChild("${1:Name}")', 'FindFirstChild(name, recursive?)'],
  ['FindFirstChildOfClass', 'FindFirstChildOfClass("${1:ClassName}")', 'FindFirstChildOfClass(className)'],
  ['FindFirstChildWhichIsA', 'FindFirstChildWhichIsA("${1:ClassName}")', 'FindFirstChildWhichIsA(className, recursive?)'],
  ['FindFirstAncestor', 'FindFirstAncestor("${1:Name}")', 'FindFirstAncestor(name)'],
  ['FindFirstAncestorOfClass', 'FindFirstAncestorOfClass("${1:ClassName}")', 'FindFirstAncestorOfClass(className)'],
  ['WaitForChild', 'WaitForChild("${1:Name}")', 'WaitForChild(name, timeout?)'],
  ['GetChildren', 'GetChildren()', 'GetChildren() — returns an array'],
  ['GetDescendants', 'GetDescendants()', 'GetDescendants() — returns an array'],
  ['IsA', 'IsA("${1:ClassName}")', 'IsA(className) — class/inheritance check'],
  ['IsAncestorOf', 'IsAncestorOf(${1:other})', 'IsAncestorOf(other)'],
  ['IsDescendantOf', 'IsDescendantOf(${1:other})', 'IsDescendantOf(other)'],
  ['Clone', 'Clone()', 'Clone() — deep copy (must be Archivable)'],
  ['Destroy', 'Destroy()', 'Destroy() — removes and locks the Parent'],
  ['GetAttribute', 'GetAttribute("${1:Name}")', 'GetAttribute(name)'],
  ['SetAttribute', 'SetAttribute("${1:Name}", ${2:value})', 'SetAttribute(name, value)'],
  ['GetPropertyChangedSignal', 'GetPropertyChangedSignal("${1:Property}")', 'GetPropertyChangedSignal(property)'],
  ['Connect', 'Connect(function(${1:...})\n\t$2\nend)', 'event:Connect(fn) — subscribe to an RBXScriptSignal'],
  ['Once', 'Once(function(${1:...})\n\t$2\nend)', 'event:Once(fn) — fires at most once'],
  ['Wait', 'Wait()', 'event:Wait() — yields until fired'],
  ['Disconnect', 'Disconnect()', 'connection:Disconnect()'],
];

// Enum.<Category> -> common member values
const ENUM_CATEGORIES = [
  'Material', 'KeyCode', 'UserInputType', 'EasingStyle', 'EasingDirection',
  'Font', 'HumanoidStateType', 'NormalId', 'Axis', 'SortOrder',
  'FillDirection', 'HorizontalAlignment', 'VerticalAlignment',
  'TextXAlignment', 'TextYAlignment', 'ScaleType', 'PartType',
];

const ENUM_MEMBERS: Record<string, string[]> = {
  Material: ['Plastic', 'SmoothPlastic', 'Wood', 'Slate', 'Concrete', 'Metal',
    'Neon', 'Glass', 'Ice', 'Grass', 'Sand', 'Brick', 'Cobblestone',
    'DiamondPlate', 'Marble', 'Granite', 'Pebble', 'Foil', 'ForceField'],
  KeyCode: ['Space', 'Return', 'Escape', 'W', 'A', 'S', 'D', 'E', 'Q',
    'LeftShift', 'LeftControl', 'Up', 'Down', 'Left', 'Right'],
  UserInputType: ['MouseButton1', 'MouseButton2', 'MouseMovement', 'Keyboard',
    'Touch', 'Gamepad1'],
  EasingStyle: ['Linear', 'Quad', 'Sine', 'Back', 'Bounce', 'Elastic',
    'Exponential', 'Circular', 'Quart', 'Quint'],
  EasingDirection: ['In', 'Out', 'InOut'],
  Font: ['SourceSans', 'SourceSansBold', 'Gotham', 'GothamBold', 'GothamBlack',
    'Legacy', 'Arial', 'Code'],
  HumanoidStateType: ['Running', 'Jumping', 'Freefall', 'Landed', 'Climbing',
    'Seated', 'Dead', 'GettingUp', 'Ragdoll'],
  NormalId: ['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right'],
  Axis: ['X', 'Y', 'Z'],
  SortOrder: ['LayoutOrder', 'Name'],
  FillDirection: ['Horizontal', 'Vertical'],
  HorizontalAlignment: ['Left', 'Center', 'Right'],
  VerticalAlignment: ['Top', 'Center', 'Bottom'],
  TextXAlignment: ['Left', 'Center', 'Right'],
  TextYAlignment: ['Top', 'Center', 'Bottom'],
  ScaleType: ['Stretch', 'Slice', 'Tile', 'Fit', 'Crop'],
  PartType: ['Ball', 'Block', 'Cylinder', 'Wedge', 'CornerWedge'],
};

let robloxCompletionsRegistered = false;

// Scans the script the user is actually writing for names they've declared —
// local variables, functions, parameters, loop variables — so that typing a
// few letters of a name you already used offers it as a suggestion too, the
// same way the built-in Roblox/Luau suggestions work. This is a lightweight
// regex scan (whole document, not real scope analysis), which is enough for
// "I typed this name once, let me autocomplete it later".
function extractUserDefinedSymbols(code: string): Array<{ name: string; kind: 'variable' | 'function'; params?: string[] }> {
  const found = new Map<string, { name: string; kind: 'variable' | 'function'; params?: string[] }>();

  const addVariable = (name: string) => {
    name = name.trim();
    if (!name || found.has(name)) return;
    found.set(name, { name, kind: 'variable' });
  };
  const addFunction = (name: string, paramsRaw?: string) => {
    name = name.trim();
    if (!name) return;
    const params = (paramsRaw || '')
      .split(',')
      .map((p) => p.split(':')[0].trim()) // strip Luau type annotations like `x: number`
      .filter((p) => p && p !== '...');
    found.set(name, { name, kind: 'function', params }); // function overrides a same-named variable entry
  };

  // local function NAME(params)
  for (const m of code.matchAll(/\blocal\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    addFunction(m[1], m[2]);
  }
  // function NAME(params)
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    addFunction(m[1], m[2]);
  }
  // function Module.Name(params) / function obj:Name(params)
  for (const m of code.matchAll(/\bfunction\s+[A-Za-z_]\w*[.:]([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    addFunction(m[1], m[2]);
  }
  // local NAME = function(params)
  for (const m of code.matchAll(/\blocal\s+([A-Za-z_]\w*)\s*=\s*function\s*\(([^)]*)\)/g)) {
    addFunction(m[1], m[2]);
  }
  // local x, y, z = ...   (excludes "local function", already handled above)
  for (const m of code.matchAll(/\blocal\s+(?!function\b)([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/g)) {
    for (const name of m[1].split(',')) addVariable(name);
  }
  // for i, v in pairs(...) do
  for (const m of code.matchAll(/\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+in\b/g)) {
    for (const name of m[1].split(',')) addVariable(name);
  }
  // for i = 1, 10 do
  for (const m of code.matchAll(/\bfor\s+([A-Za-z_]\w*)\s*=/g)) {
    addVariable(m[1]);
  }
  // function parameters: function(...) / function name(...)
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_]*[.:\w]*\s*\(([^)]*)\)/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(':')[0].trim();
      if (name && name !== '...') addVariable(name);
    }
  }

  return Array.from(found.values());
}

function registerRobloxCompletions(monaco: any) {
  if (robloxCompletionsRegistered) return;
  robloxCompletionsRegistered = true;

  const SnippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  monaco.languages.registerCompletionItemProvider('lua', {
    triggerCharacters: ['.', ':', '"', "'"],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions: any[] = [];

      // Enum.Category.<value>
      const enumMemberMatch = textUntilPosition.match(/Enum\.(\w+)\.\w*$/);
      if (enumMemberMatch && ENUM_MEMBERS[enumMemberMatch[1]]) {
        for (const value of ENUM_MEMBERS[enumMemberMatch[1]]) {
          suggestions.push({
            label: value,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: value,
            detail: `Enum.${enumMemberMatch[1]}.${value}`,
            range,
          });
        }
        return { suggestions };
      }

      // Enum.<Category>
      if (/Enum\.\w*$/.test(textUntilPosition)) {
        for (const category of ENUM_CATEGORIES) {
          suggestions.push({
            label: category,
            kind: monaco.languages.CompletionItemKind.Enum,
            insertText: category,
            detail: `Enum.${category}`,
            range,
          });
        }
        return { suggestions };
      }

      // :GetService("<Name>")
      if (/GetService\(\s*["']\w*$/.test(textUntilPosition)) {
        for (const service of ROBLOX_SERVICES) {
          suggestions.push({
            label: service,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: service,
            detail: `Service: ${service}`,
            range,
          });
        }
        return { suggestions };
      }

      // <namespace>.<member> — string./table./math./os./coroutine./task./bit32./utf8.
      const namespaceMatch = textUntilPosition.match(/\b(string|table|math|os|coroutine|task|bit32|utf8)\.\w*$/);
      if (namespaceMatch && LIBRARY_MEMBERS[namespaceMatch[1]]) {
        for (const [label, insertText, detail] of LIBRARY_MEMBERS[namespaceMatch[1]]) {
          suggestions.push({
            label,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText,
            insertTextRules: SnippetRule,
            detail,
            range,
          });
        }
        return { suggestions };
      }

      // identifier: — likely an Instance method/event call
      if (/\w:\s*\w*$/.test(textUntilPosition)) {
        for (const [label, insertText, detail] of INSTANCE_METHODS) {
          suggestions.push({
            label,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText,
            insertTextRules: SnippetRule,
            detail,
            range,
          });
        }
        return { suggestions };
      }

      // Default: keywords + globals + namespaces + datatype constructors
      for (const kw of LUAU_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }
      for (const [label, insertText, detail] of GLOBAL_FUNCTIONS) {
        suggestions.push({
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText,
          insertTextRules: SnippetRule,
          detail,
          range,
        });
      }
      for (const namespace of Object.keys(LIBRARY_MEMBERS)) {
        suggestions.push({
          label: namespace,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: namespace,
          detail: `${namespace} library`,
          range,
        });
      }
      for (const [label, insertText, detail] of DATATYPE_CONSTRUCTORS) {
        suggestions.push({
          label,
          kind: monaco.languages.CompletionItemKind.Constructor,
          insertText,
          insertTextRules: SnippetRule,
          detail,
          range,
        });
      }
      suggestions.push({
        label: 'Enum',
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: 'Enum',
        detail: 'Enum namespace',
        range,
      });

      // The user's own variables, functions, parameters, and loop variables —
      // once you've written a name once, it's suggested from then on.
      for (const symbol of extractUserDefinedSymbols(model.getValue())) {
        if (symbol.kind === 'function') {
          const params = symbol.params || [];
          const snippetParams = params.map((p, i) => `\${${i + 1}:${p}}`).join(', ');
          suggestions.push({
            label: symbol.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${symbol.name}(${snippetParams})`,
            insertTextRules: SnippetRule,
            detail: `(your function) ${symbol.name}(${params.join(', ')})`,
            range,
          });
        } else {
          suggestions.push({
            label: symbol.name,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: symbol.name,
            detail: '(your variable)',
            range,
          });
        }
      }

      return { suggestions };
    },
  });
}

let robloxThemeRegistered = false;

// Colors verified against Roblox Studio's own dark script-editor theme.
const ROBLOX_STUDIO_COLORS = {
  background: '252525',
  text: 'cccccc',
  comment: '666666',
  string: 'adf195',
  number: 'ffc600',
  keyword: 'f86d7c',       // if/then/local/function/self/etc.
  builtin: '84d6f7',       // print, game, workspace, Vector3, string, task, ...
  functionName: 'fdfbac',  // a call: foo(), obj.method(), obj:Method()
  property: '61a1f1',      // obj.Property (not called)
  operator: 'cccccc',
};

// Anything Studio's editor recognizes as part of the Roblox/Luau global API
// surface and colors specially, rather than as a plain identifier.
const ROBLOX_BUILTIN_IDENTIFIERS = [
  // global functions
  'print', 'warn', 'error', 'assert', 'pcall', 'xpcall', 'ipairs', 'pairs',
  'next', 'select', 'tostring', 'tonumber', 'type', 'typeof', 'unpack',
  'rawequal', 'rawget', 'rawset', 'rawlen', 'setmetatable', 'getmetatable',
  'require', 'collectgarbage', 'loadstring', 'newproxy', 'delay', 'spawn',
  'wait', 'tick', 'settings', 'UserSettings', 'elapsedTime',
  // roblox globals
  'game', 'workspace', 'script', 'shared', 'plugin', '_G',
  // datatype / class constructors
  'Instance', 'Enum', 'Vector2', 'Vector3', 'Vector2int16', 'Vector3int16',
  'CFrame', 'Color3', 'ColorSequence', 'ColorSequenceKeypoint', 'NumberRange',
  'NumberSequence', 'NumberSequenceKeypoint', 'UDim', 'UDim2', 'BrickColor',
  'Ray', 'Region3', 'Region3int16', 'Rect', 'Faces', 'Axes',
  'PhysicalProperties', 'TweenInfo', 'Random', 'DateTime',
  'DockWidgetPluginGuiInfo', 'OverlapParams', 'RaycastParams',
  // standard libraries
  'string', 'table', 'math', 'os', 'coroutine', 'task', 'bit32', 'utf8',
  'debug', 'buffer',
];

function setupRobloxStudioTheme(monaco: any) {
  if (robloxThemeRegistered) return;
  robloxThemeRegistered = true;

  monaco.languages.setMonarchTokensProvider('lua', {
    defaultToken: '',
    keywords: [
      'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
      'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat',
      'return', 'then', 'true', 'until', 'while', 'continue', 'self',
      'type', 'export',
    ],
    builtins: ROBLOX_BUILTIN_IDENTIFIERS,
    symbols: /[=><!~?:&|+\-*\/\^%#]+/,
    tokenizer: {
      root: [
        // identifier immediately followed by '(' -> being called
        [/[a-zA-Z_]\w*(?=\s*\()/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'predefined',
            '@default': 'function.call',
          },
        }],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        }],
        { include: '@whitespace' },
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_single'],
        [/\[(=*)\[/, 'string', '@string_long'],
        [/\d+\.\d*([eE][-+]?\d+)?/, 'number.float'],
        [/\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],
        [/[{}()\[\]]/, '@brackets'],
        // property access or method call after . / :
        [/[.:](?=\s*[a-zA-Z_]\w*\s*\()/, 'delimiter', '@methodname'],
        [/[.:]/, 'delimiter', '@propertyname'],
        [/@symbols/, 'operator'],
        [/[;,]/, 'delimiter'],
      ],
      methodname: [
        [/[a-zA-Z_]\w*/, 'function.call', '@pop'],
      ],
      propertyname: [
        [/[a-zA-Z_]\w*/, 'property.name', '@pop'],
        [/./, '', '@pop'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/--\[(=*)\[/, 'comment', '@comment_long'],
        [/--.*$/, 'comment'],
      ],
      comment_long: [
        [/[^\]]+/, 'comment'],
        [/\]\]/, 'comment', '@pop'],
        [/./, 'comment'],
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],
      string_long: [
        [/[^\]]+/, 'string'],
        [/\]\]/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  });

  monaco.editor.defineTheme('roblox-studio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: ROBLOX_STUDIO_COLORS.keyword },
      { token: 'predefined', foreground: ROBLOX_STUDIO_COLORS.builtin },
      { token: 'function.call', foreground: ROBLOX_STUDIO_COLORS.functionName },
      { token: 'property.name', foreground: ROBLOX_STUDIO_COLORS.property },
      { token: 'string', foreground: ROBLOX_STUDIO_COLORS.string },
      { token: 'string.escape', foreground: ROBLOX_STUDIO_COLORS.string },
      { token: 'string.invalid', foreground: 'ff4444' },
      { token: 'number', foreground: ROBLOX_STUDIO_COLORS.number },
      { token: 'number.float', foreground: ROBLOX_STUDIO_COLORS.number },
      { token: 'number.hex', foreground: ROBLOX_STUDIO_COLORS.number },
      { token: 'comment', foreground: ROBLOX_STUDIO_COLORS.comment },
      { token: 'operator', foreground: ROBLOX_STUDIO_COLORS.operator },
      { token: 'delimiter', foreground: ROBLOX_STUDIO_COLORS.text },
      { token: 'identifier', foreground: ROBLOX_STUDIO_COLORS.text },
    ],
    colors: {
      'editor.background': `#${ROBLOX_STUDIO_COLORS.background}`,
      'editor.foreground': `#${ROBLOX_STUDIO_COLORS.text}`,
      'editorLineNumber.foreground': '#666666',
      'editorLineNumber.activeForeground': '#cccccc',
      'editorCursor.foreground': '#ffffff',
      'editor.selectionBackground': '#0b5aaf',
      'editor.lineHighlightBackground': '#2d3241',
      'editorBracketMatch.background': '#55555580',
      'editorBracketMatch.border': '#00000000',
      'editorError.foreground': '#ff4d4d',
      'editorError.border': '#00000000',
      'editorWarning.foreground': '#ffbf00',
      'editorWarning.border': '#00000000',
      'editorInfo.foreground': '#38bdf8',
      'editorHint.foreground': '#a3e681',
      'editorOverviewRuler.errorForeground': '#ff4d4d',
      'editorOverviewRuler.warningForeground': '#ffbf00',
    },
  });
}

function setupRobloxStudioEditor(editor: any, monaco: any) {
  registerRobloxCompletions(monaco);

  monaco.languages.setLanguageConfiguration('lua', {
    comments: {
      lineComment: '--',
      blockComment: ['--[[', ']]'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    indentationRules: {
      increaseIndentPattern: /^((?!(--)).)*((\b(then|do|repeat|else)\b)|(\bfunction(\s+[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*(?::[a-zA-Z_][a-zA-Z0-9_]*)?)?\s*\([^\)]*\))|(\{)|(\()|(\[))\s*$/,
      decreaseIndentPattern: /^\s*(end|until|else|elseif|\}|\)|\].*)$/,
    },
    onEnterRules: [
      {
        beforeText: /\{[^}]*$/,
        afterText: /^\s*\}/,
        action: { indentAction: monaco.languages.IndentAction.IndentOutdent },
      },
      {
        beforeText: /\([^)]*$/,
        afterText: /^\s*\)/,
        action: { indentAction: monaco.languages.IndentAction.IndentOutdent },
      },
      {
        beforeText: /\[[^\]]*$/,
        afterText: /^\s*\]/,
        action: { indentAction: monaco.languages.IndentAction.IndentOutdent },
      },
    ],
  });

  editor.onKeyDown((e: any) => {
    if (e.keyCode !== monaco.KeyCode.Enter && e.browserEvent?.key !== 'Enter') {
      return;
    }

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      return;
    }

    const model = editor.getModel();
    if (!model) return;

    const pos = editor.getPosition();
    if (!pos) return;

    const lineContent = model.getLineContent(pos.lineNumber);
    const textBefore = lineContent.substring(0, pos.column - 1);
    const textAfter = lineContent.substring(pos.column - 1).trim();

    if (textAfter.length > 0 && !textAfter.startsWith('--')) {
      return;
    }

    const trimmedBefore = textBefore.replace(/--.*$/, '').trim();
    if (!trimmedBefore) return;

    let closer: string | null = null;
    let isContinuation = false;

    if (/^repeat\b/.test(trimmedBefore)) {
      closer = 'until ';
    } else if (/\b(then|do)$/.test(trimmedBefore)) {
      if (/^\s*elseif\b/.test(trimmedBefore)) {
        isContinuation = true;
      } else {
        closer = 'end';
      }
    } else if (/function(?:\s+[a-zA-Z0-9_.:]+)?\s*\([^)]*\)$/.test(trimmedBefore)) {
      let depth = 0;
      for (let i = 0; i < trimmedBefore.length; i++) {
        if (trimmedBefore[i] === '(') depth++;
        else if (trimmedBefore[i] === ')') depth--;
      }
      closer = depth > 0 ? 'end)' : 'end';
    } else if (/^\s*else$/.test(trimmedBefore)) {
      isContinuation = true;
    }

    const tabSize = model.getOptions().tabSize || 4;
    const indentStep = ' '.repeat(tabSize);
    const baseIndent = lineContent.match(/^(\s*)/)?.[1] || '';
    const blockIndent = baseIndent + indentStep;

    if (isContinuation) {
      e.preventDefault();
      e.stopPropagation();
      const textToInsert = `\n${blockIndent}`;
      editor.executeEdits('roblox-auto-nest', [
        {
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          text: textToInsert,
        },
      ]);
      editor.setPosition({
        lineNumber: pos.lineNumber + 1,
        column: blockIndent.length + 1,
      });
      return;
    }

    if (!closer) return;

    const lines = model.getLinesContent();
    let openers = 0;
    let closers = 0;
    for (const line of lines) {
      const l = line.replace(/--.*$/, '').trim();
      if (!l) continue;
      const op = (l.match(/\b(then|do)\b|\bfunction\b|\brepeat\b/g) || []).length;
      const cl = (l.match(/\b(end|until)\b/g) || []).length;
      openers += op;
      closers += cl;
    }

    let nextNonEmptyLine = '';
    for (let i = pos.lineNumber; i < lines.length; i++) {
      const nextL = lines[i].trim();
      if (nextL) {
        nextNonEmptyLine = nextL;
        break;
      }
    }
    const nextAlreadyCloses = /^(\s*)(end|until|else|elseif)/.test(nextNonEmptyLine);

    if (openers > closers || !nextAlreadyCloses) {
      e.preventDefault();
      e.stopPropagation();
      const textToInsert = `\n${blockIndent}\n${baseIndent}${closer}`;
      editor.executeEdits('roblox-auto-nest', [
        {
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          text: textToInsert,
        },
      ]);
      editor.setPosition({
        lineNumber: pos.lineNumber + 1,
        column: blockIndent.length + 1,
      });
    }
  });
}

export default function App() {
  const [tree, setTree] = useState<TreeNodeData[]>(initialTree);
  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const [gameplayMode, setGameplayMode] = useState<'server' | 'client'>('server');
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'translate' | 'scale' | 'rotate'>('select');
  
  // Scripts Code State
  const [scriptsCode, setScriptsCode] = useState<Record<string, string>>(initialDefaultScripts);

  // Tabs State
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: 'viewport', name: 'Viewport', type: 'viewport' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('viewport');

  // Output Logs State
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init_1',
      timestamp: formatTimestamp(),
      type: 'system',
      message: 'Wasmoon Lua VM ready. Double click any Script to open code editor, then click Play!'
    }
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const serverRuntimeRef = useRef<LuaRuntime | null>(null);
  const clientRuntimeRef = useRef<LuaRuntime | null>(null);
  
  const [serverRuntimeTree, setServerRuntimeTree] = useState<TreeNodeData[]>([]);
  const serverRuntimeTreeRef = useRef(serverRuntimeTree);
  useEffect(() => {
    serverRuntimeTreeRef.current = serverRuntimeTree;
  }, [serverRuntimeTree]);

  const [clientRuntimeTree, setClientRuntimeTree] = useState<TreeNodeData[]>([]);
  const clientRuntimeTreeRef = useRef(clientRuntimeTree);
  useEffect(() => {
    clientRuntimeTreeRef.current = clientRuntimeTree;
  }, [clientRuntimeTree]);

  // Replication: whenever the server tree changes (Script edits, physics,
  // instance creation/deletion), merge those authoritative changes down into
  // the client tree — mirroring how Roblox replicates Workspace/ReplicatedStorage
  // etc. from server to client. Client-only instances (created by LocalScripts)
  // are left untouched; ServerScriptService/ServerStorage never replicate.
  useEffect(() => {
    if (!isRunning) return;
    const replicatedTree = replicateServerToClient(serverRuntimeTree, clientRuntimeTreeRef.current);
    clientRuntimeTreeRef.current = replicatedTree;
    setClientRuntimeTree(replicatedTree);
  }, [serverRuntimeTree, isRunning]);

  // Alias for backward compat — runtimeTree points to the active mode's tree
  const runtimeTree = gameplayMode === 'server' ? serverRuntimeTree : clientRuntimeTree;
  const setRuntimeTree = gameplayMode === 'server' ? setServerRuntimeTree : setClientRuntimeTree;
  const runtimeTreeRef = gameplayMode === 'server' ? serverRuntimeTreeRef : clientRuntimeTreeRef;
  
  const displayTree = isRunning && activeTabId === 'gameplay' ? runtimeTree : tree;
  
  const updateActiveTree = (updater: (prevTree: TreeNodeData[]) => TreeNodeData[]) => {
    if (isRunning && activeTabId === 'gameplay') {
       setRuntimeTree(prev => updater(prev));
    } else {
       setTree(prev => updater(prev));
    }
  };
  
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Live error squiggles: refs to the mounted Monaco editor/API, plus the
  // current syntax error (if any) for the active tab, shown in the status bar.
  const monacoApiRef = useRef<any>(null);
  const codeEditorRef = useRef<any>(null);
  const lintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lintRequestIdRef = useRef(0);
  const lintedTabRef = useRef<string | null>(null);
  const [syntaxError, setSyntaxError] = useState<LuaSyntaxError | null>(null);
  const [warningDiagnostics, setWarningDiagnostics] = useState<LuauDiagnostic[]>([]);

  // Compiles `code` (without running it) and paints red squiggle markers for syntax errors
  // and yellow squiggle markers for Luau warnings (unknown globals, unused variables, deprecated APIs).
  const runLuaLint = useCallback(async (code: string) => {
    const monacoInst = monacoApiRef.current;
    const editorInst = codeEditorRef.current;
    if (!monacoInst || !editorInst) return;
    const model = editorInst.getModel();
    if (!model) return;

    const requestId = ++lintRequestIdRef.current;
    const error = await checkLuaSyntax(code);

    // If the editor moved on while we were awaiting the check, don't paint stale results.
    if (requestId !== lintRequestIdRef.current || model.isDisposed()) return;

    setSyntaxError(error);

    const markers: any[] = [];

    // 1. Red Squiggly Line for Syntax Error
    if (error) {
      const errorDiag = formatSyntaxErrorDiagnostic(error, model);
      markers.push({
        severity: monacoInst.MarkerSeverity.Error,
        message: errorDiag.message,
        startLineNumber: errorDiag.startLineNumber,
        startColumn: errorDiag.startColumn,
        endLineNumber: errorDiag.endLineNumber,
        endColumn: errorDiag.endColumn,
        source: 'Luau',
      });
    }

    // 2. Yellow Squiggly Lines for Luau Warnings
    try {
      const warnings = analyzeLuau(code);
      setWarningDiagnostics(warnings);
      for (const w of warnings) {
        markers.push({
          severity: monacoInst.MarkerSeverity.Warning,
          message: w.message,
          startLineNumber: w.startLineNumber,
          startColumn: w.startColumn,
          endLineNumber: w.endLineNumber,
          endColumn: w.endColumn,
          source: 'Luau',
        });
      }
    } catch {
      setWarningDiagnostics([]);
    }

    // Paint both red and yellow squiggly lines onto the editor model
    monacoInst.editor.setModelMarkers(model, 'luau-diagnostics', markers);
  }, []);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; targetId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    targetId: null,
  });

  // Auto scroll output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Handle deleting nodes with Backspace or Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        const findNode = (nodes: TreeNodeData[], id: string): TreeNodeData | undefined => {
          for (const node of nodes) {
            if (node.id === id) return node;
            const found = findNode(node.children, id);
            if (found) return found;
          }
        };
        
        const node = findNode(displayTree, selectedId);
        // Do not allow deleting root services
        if (node && node.type !== 'service') {
          const removeNode = (nodes: TreeNodeData[]): TreeNodeData[] => {
            return nodes
              .filter((n) => n.id !== selectedId)
              .map((n) => ({ ...n, children: removeNode(n.children) }));
          };
          updateActiveTree((prevTree) => removeNode(prevTree));
          
          // Close tab if opened
          setTabs((prevTabs) => {
            const nextTabs = prevTabs.filter((t) => t.id !== selectedId);
            if (activeTabId === selectedId) {
              setActiveTabId(nextTabs[nextTabs.length - 1]?.id || 'viewport');
            }
            return nextTabs;
          });

          setSelectedId(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, tree, activeTabId]);

  const addLog = (type: LogType, message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: formatTimestamp(),
        type,
        message,
      },
    ]);
  };

  const clearOutput = () => {
    setLogs([]);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setSelectedId(id);
    const menuHeight = 300;
    const menuWidth = 210;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({
      visible: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      targetId: id,
    });
  };

  const handleRename = (id: string, newName: string) => {
    if (!newName.trim()) return;
    
    const updateNodeName = (nodes: TreeNodeData[]): TreeNodeData[] => {
      return nodes.map(node => {
        if (node.id === id) {
          // If a script tab is open, update its name too
          setTabs(prev => prev.map(t => t.id === id ? { ...t, name: newName } as TabItem : t));
          return { ...node, name: newName };
        }
        return { ...node, children: updateNodeName(node.children) };
      });
    };
    
    updateActiveTree(prev => updateNodeName(prev));
  };

  const handleDragStart = (e: React.DragEvent, node: TreeNodeData) => {
    if (node.type === 'service') return;
    setDraggedId(node.id);
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== targetId && draggedId !== targetId) {
      setDropTargetId(targetId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (dropTargetId === targetId) {
      setDropTargetId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDropTargetId(null);

    if (!draggedId || draggedId === targetId) return;

    let draggedNode: TreeNodeData | null = null;

    const removeNode = (nodes: TreeNodeData[]): TreeNodeData[] => {
      const filtered = nodes.filter(n => {
        if (n.id === draggedId) {
          draggedNode = n;
          return false;
        }
        return true;
      });
      return filtered.map(n => ({ ...n, children: removeNode(n.children) }));
    };

    const newTree = removeNode(displayTree);
    if (!draggedNode) return;

    let targetFound = false;
    const insertNode = (nodes: TreeNodeData[]): TreeNodeData[] => {
      return nodes.map(n => {
        if (n.id === targetId) {
          targetFound = true;
          return { ...n, children: [...n.children, draggedNode!], expanded: true };
        }
        return { ...n, children: insertNode(n.children) };
      });
    };

    const finalTree = insertNode(newTree);
    if (targetFound) {
      updateActiveTree(() => finalTree);
      setSelectedId(draggedId);
    }
    
    setDraggedId(null);
  };

  const toggleExpand = (id: string, currentTree: TreeNodeData[]): TreeNodeData[] => {
    return currentTree.map((node) => {
      if (node.id === id) {
        return { ...node, expanded: !node.expanded };
      }
      if (node.children.length > 0) {
        return { ...node, children: toggleExpand(id, node.children) };
      }
      return node;
    });
  };

  const insertObject = (
    targetId: string, 
    objectType: 
      | 'object' 
      | 'model'
      | 'folder'
      | 'decal'
      | 'texture'
      | 'script' 
      | 'localscript' 
      | 'modulescript' 
      | 'remoteevent' 
      | 'remotefunction' 
      | 'pointlight'
      | 'spotlight'
      | 'surfacelight'
      | 'sky'
      | 'atmosphere'
      | 'colorcorrectioneffect'
      | 'bloomeffect'
      | 'sunrayseffect'
      | 'blureffect'
      | 'depthoffieldeffect'
  ) => {
    const newId = 'node_' + Math.random().toString(36).substring(2, 9);
    let name = 'Part';
    let defaultCode = '';

    if (objectType === 'model') {
      name = 'Model';
    } else if (objectType === 'folder') {
      name = 'Folder';
    } else if (objectType === 'decal') {
      name = 'Decal';
    } else if (objectType === 'texture') {
      name = 'Texture';
    } else if (objectType === 'script') {
      name = 'Script';
      defaultCode = `-- ${name}\nprint("Hello world from " .. script.Name)`;
    } else if (objectType === 'localscript') {
      name = 'LocalScript';
      defaultCode = `-- ${name}\nprint("Hello client from " .. script.Name)`;
    } else if (objectType === 'modulescript') {
      name = 'ModuleScript';
      defaultCode = `local module = {}\n\nfunction module.hello()\n    print("Hello from ${name}!")\nend\n\nreturn module\n`;
    } else if (objectType === 'remoteevent') {
      name = 'RemoteEvent';
    } else if (objectType === 'remotefunction') {
      name = 'RemoteFunction';
    } else if (objectType === 'pointlight') {
      name = 'PointLight';
    } else if (objectType === 'spotlight') {
      name = 'SpotLight';
    } else if (objectType === 'surfacelight') {
      name = 'SurfaceLight';
    } else if (objectType === 'sky') {
      name = 'Sky';
    } else if (objectType === 'atmosphere') {
      name = 'Atmosphere';
    } else if (objectType === 'colorcorrectioneffect') {
      name = 'ColorCorrection';
    } else if (objectType === 'bloomeffect') {
      name = 'Bloom';
    } else if (objectType === 'sunrayseffect') {
      name = 'SunRays';
    } else if (objectType === 'blureffect') {
      name = 'Blur';
    } else if (objectType === 'depthoffieldeffect') {
      name = 'DepthOfField';
    }

    const isContainer = objectType === 'model' || objectType === 'folder';
    const isDecalOrTexture = objectType === 'decal' || objectType === 'texture';

    const newNode: TreeNodeData = {
      id: newId,
      name,
      type: objectType,
      children: [],
      position: (isContainer || isDecalOrTexture) ? undefined : [0, 5, 0],
      rotation: (isContainer || isDecalOrTexture) ? undefined : [0, 0, 0],
      size: (isContainer || isDecalOrTexture) ? undefined : [4, 4, 4],
      color: isDecalOrTexture ? '#ffffff' : (isContainer ? undefined : '#a3a2a5'),
      anchored: (isContainer || isDecalOrTexture) ? undefined : false,
      canCollide: (isContainer || isDecalOrTexture) ? undefined : true,
      canTouch: (isContainer || isDecalOrTexture) ? undefined : true,
      // Decal / Texture
      texture: isDecalOrTexture ? '' : undefined,
      face: isDecalOrTexture ? 'Front' : ((objectType === 'spotlight' || objectType === 'surfacelight') ? 'Front' : undefined),
      transparency: isDecalOrTexture ? 0 : undefined,
      studsPerTileU: objectType === 'texture' ? 2 : undefined,
      studsPerTileV: objectType === 'texture' ? 2 : undefined,
      offsetStudsU: objectType === 'texture' ? 0 : undefined,
      offsetStudsV: objectType === 'texture' ? 0 : undefined,
      // Lights
      range: objectType.includes('light') ? 16 : undefined,
      lightBrightness: objectType.includes('light') ? 1 : undefined,
      lightColor: objectType.includes('light') ? '#ffffff' : undefined,
      shadows: objectType.includes('light') ? false : undefined,
      angle: (objectType === 'spotlight' || objectType === 'surfacelight') ? 90 : undefined,
      enabled: true,
      // Sky
      sunAngularSize: objectType === 'sky' ? 21 : undefined,
      moonAngularSize: objectType === 'sky' ? 11 : undefined,
      celestialBodiesShown: objectType === 'sky' ? true : undefined,
      starCount: objectType === 'sky' ? 3000 : undefined,
      // Atmosphere
      density: objectType === 'atmosphere' ? 0.395 : undefined,
      offset: objectType === 'atmosphere' ? 0.25 : undefined,
      decay: objectType === 'atmosphere' ? '#6a5b4f' : undefined,
      glare: objectType === 'atmosphere' ? 0 : undefined,
      haze: objectType === 'atmosphere' ? 0 : undefined,
      // Effects
      contrast: objectType === 'colorcorrectioneffect' ? 0 : undefined,
      saturation: objectType === 'colorcorrectioneffect' ? 0 : undefined,
      tintColor: objectType === 'colorcorrectioneffect' ? '#ffffff' : undefined,
      intensity: objectType === 'bloomeffect' ? 1 : objectType === 'sunrayseffect' ? 0.25 : undefined,
      threshold: objectType === 'bloomeffect' ? 2 : undefined,
      spread: objectType === 'sunrayseffect' ? 0.1 : undefined,
      effectSize: (objectType === 'bloomeffect' || objectType === 'blureffect') ? 24 : undefined,
    };

    if (defaultCode) {
      setScriptsCode((prev) => ({ ...prev, [newId]: defaultCode }));
    }

    const addNode = (nodes: TreeNodeData[]): TreeNodeData[] => {
      return nodes.map((node) => {
        if (node.id === targetId) {
          return { ...node, children: [...node.children, newNode], expanded: true };
        }
        if (node.children.length > 0) {
          return { ...node, children: addNode(node.children) };
        }
        return node;
      });
    };

    updateActiveTree(prev => addNode(prev));
    setSelectedId(newId);
    setContextMenu({ visible: false, x: 0, y: 0, targetId: null });

    // If it is a script, also open in tab
    if (['script', 'localscript', 'modulescript'].includes(objectType)) {
      setTabs((prev) => {
        if (!prev.find((t) => t.id === newId)) {
          return [...prev, { id: newId, name, type: objectType as any }];
        }
        return prev;
      });
      setActiveTabId(newId);
    }
  };

  const openScriptTab = (node: TreeNodeData) => {
    if (['script', 'localscript', 'modulescript'].includes(node.type)) {
      if (!tabs.find((t) => t.id === node.id)) {
        setTabs([
          ...tabs,
          {
            id: node.id,
            name: node.name,
            type: node.type as 'script' | 'localscript' | 'modulescript',
          },
        ]);
      }
      // If no code exists yet, initialize it
      if (scriptsCode[node.id] === undefined) {
        setScriptsCode((prev) => ({
          ...prev,
          [node.id]: `-- ${node.name}\nprint("Hello world from " .. script.Name)`,
        }));
      }
      setActiveTabId(node.id);
    }
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[newTabs.length - 1]?.id || 'viewport');
    }
  };

  // Helper to find all runnable scripts and module scripts across the tree
  const collectAllScripts = (nodes: TreeNodeData[]) => {
    const serverScripts: { id: string; name: string; type: string }[] = [];
    const clientScripts: { id: string; name: string; type: string }[] = [];
    const modules: Record<string, string> = {};

    const traverse = (items: TreeNodeData[]) => {
      for (const item of items) {
        if (!item.disabled) {
          if (item.type === 'script') {
            serverScripts.push({ id: item.id, name: item.name, type: item.type });
          } else if (item.type === 'localscript') {
            clientScripts.push({ id: item.id, name: item.name, type: item.type });
          } else if (item.type === 'modulescript') {
            modules[item.name] = scriptsCode[item.id] || '';
          }
        }
        if (item.children.length > 0) {
          traverse(item.children);
        }
      }
    };

    traverse(nodes);
    return { serverScripts, clientScripts, modules };
  };

  // Run all scripts in the project
  const handlePlay = async () => {
    if (isRunning) {
      setIsRunning(false);
      globalPhysicsEngine.isSimulating = false;
      globalPhysicsEngine.reset();
      globalRemoteBridge.reset();
      
      // Stop both runtimes
      if (serverRuntimeRef.current) {
         serverRuntimeRef.current.stop();
         serverRuntimeRef.current = null;
      }
      if (clientRuntimeRef.current) {
         clientRuntimeRef.current.stop();
         clientRuntimeRef.current = null;
      }
      
      // Remove Gameplay tab
      const newTabs = tabs.filter(t => t.id !== 'gameplay');
      setTabs(newTabs);
      if (activeTabId === 'gameplay') {
         setActiveTabId('viewport');
      }
      return;
    }

    try {
      const { serverScripts, clientScripts, modules } = collectAllScripts(tree);
      
      setIsRunning(true);
      globalPhysicsEngine.reset();
      globalPhysicsEngine.isSimulating = true;
      globalRemoteBridge.reset();

      // Initialize both runtime trees with a copy of the edit tree.
      // The client's copy has ServerScriptService/ServerStorage contents
      // stripped out, since those never replicate to clients in real Roblox.
      const treeCopy = JSON.parse(JSON.stringify(tree));
      const clientTreeCopy = stripNonReplicated(JSON.parse(JSON.stringify(treeCopy)));
      serverRuntimeTreeRef.current = treeCopy;
      clientRuntimeTreeRef.current = clientTreeCopy;
      setServerRuntimeTree(treeCopy);
      setClientRuntimeTree(clientTreeCopy);
      
      if (!tabs.find((t) => t.id === 'gameplay')) {
        setTabs([...tabs, { id: 'gameplay', name: 'Gameplay', type: 'viewport' }]);
      }
      setActiveTabId('gameplay');
      
      // Server runtime — Scripts run here, updating serverRuntimeTree
      const getServerTree = () => serverRuntimeTreeRef.current;
      const updateServerTree = (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => {
        const nextTree = updater(serverRuntimeTreeRef.current);
        serverRuntimeTreeRef.current = nextTree;
        setServerRuntimeTree(nextTree);
      };

      // Client runtime — LocalScripts run here, updating clientRuntimeTree
      const getClientTree = () => clientRuntimeTreeRef.current;
      const updateClientTree = (updater: (tree: TreeNodeData[]) => TreeNodeData[]) => {
        const nextTree = updater(clientRuntimeTreeRef.current);
        clientRuntimeTreeRef.current = nextTree;
        setClientRuntimeTree(nextTree);
      };

      // Run server scripts
      if (serverScripts.length > 0) {
        serverRuntimeRef.current = new LuaRuntime();
        const scriptsToRun = serverScripts.map(s => ({
           id: s.id,
           name: s.name,
           type: s.type,
           code: scriptsCode[s.id] || ''
        }));
        // Fire and forget — don't await so client scripts can start too
        serverRuntimeRef.current.start(scriptsToRun, modules, addLog, getServerTree, updateServerTree, 'server');
      }

      // Run client scripts
      if (clientScripts.length > 0) {
        clientRuntimeRef.current = new LuaRuntime();
        const scriptsToRun = clientScripts.map(s => ({
           id: s.id,
           name: s.name,
           type: s.type,
           code: scriptsCode[s.id] || ''
        }));
        clientRuntimeRef.current.start(scriptsToRun, modules, addLog, getClientTree, updateClientTree, 'client');
      }

    } catch (err: any) {
      addLog('error', `Execution runtime error: ${err?.message || err}`);
      setIsRunning(false);
      globalPhysicsEngine.isSimulating = false;
    }
  };


  const getNodeIcon = (name: string, type: string) => {
    // Try Roblox extracted icon first
    const robloxUrl = getRobloxIconUrl(name, type);
    if (robloxUrl) {
      return (
        <img
          src={robloxUrl}
          alt=""
          className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 object-contain select-none pointer-events-none"
          draggable={false}
        />
      );
    }

    // Fallback to Lucide icons
    const getProps = (colorClass: string) => ({
      size: 14,
      className: `mr-1.5 flex-shrink-0 ${colorClass}`,
    });

    const nodeType = (type || '').toLowerCase();

    if (nodeType === 'pointlight' || nodeType === 'spotlight' || nodeType === 'surfacelight') {
      return <Lightbulb {...getProps('text-[#ffca28]')} />;
    }
    if (nodeType === 'decal') return <ImageIcon {...getProps('text-[#f472b6]')} />;
    if (nodeType === 'texture') return <Grid {...getProps('text-[#38bdf8]')} />;
    if (nodeType === 'sky') return <Cloud {...getProps('text-[#64b5f6]')} />;
    if (nodeType === 'atmosphere') return <Flame {...getProps('text-[#ff8a65]')} />;
    if (nodeType === 'colorcorrectioneffect') return <Sliders {...getProps('text-[#4dd0e1]')} />;
    if (nodeType === 'bloomeffect') return <Sparkles {...getProps('text-[#ffd54f]')} />;
    if (nodeType === 'sunrayseffect') return <Sun {...getProps('text-[#ffb74d]')} />;
    if (nodeType === 'blureffect' || nodeType === 'depthoffieldeffect') return <Eye {...getProps('text-[#ba68c8]')} />;

    if (type === 'object' || type === 'part') return <Box {...getProps('text-[#8a8a8a]')} />;
    if (type === 'script') return <FileCode {...getProps('text-[#a3e681]')} />;
    if (type === 'localscript') return <FileCode {...getProps('text-[#38bdf8]')} />;
    if (type === 'modulescript') return <FileJson {...getProps('text-[#f59e0b]')} />;
    if (type === 'remoteevent') return <Zap {...getProps('text-[#fb923c]')} />;
    if (type === 'remotefunction') return <ArrowLeftRight {...getProps('text-[#c084fc]')} />;
    if (type === 'camera') return <Camera {...getProps('text-[#8a8a8a]')} />;
    if (type === 'terrain') return <Mountain {...getProps('text-[#4CAF50]')} />;
    if (type === 'spawnlocation') return <Sun {...getProps('text-[#8a8a8a]')} />;
    if (type === 'folder_script' || type === 'folder') return <Folder {...getProps('text-[#FDD835]')} />;
    if (type === 'model') return <Boxes {...getProps('text-[#00BCD4]')} />;
    
    switch (name.toLowerCase()) {
      case 'workspace': return <Globe {...getProps('text-[#4FC3F7]')} />;
      case 'players': return <Users {...getProps('text-[#81C784]')} />;
      case 'lighting': return <Sun {...getProps('text-[#FDD835]')} />;
      case 'materialservice': return <Layers {...getProps('text-[#D4A373]')} />;
      case 'replicatedfirst': return <ArrowRight {...getProps('text-[#90CAF9]')} />;
      case 'replicatedstorage': return <Package {...getProps('text-[#FDD835]')} />;
      case 'serverscriptservice': return <Server {...getProps('text-[#4CAF50]')} />;
      case 'serverstorage': return <HardDrive {...getProps('text-[#4CAF50]')} />;
      case 'startergui': return <Layout {...getProps('text-[#FDD835]')} />;
      case 'starterpack': return <Briefcase {...getProps('text-[#FDD835]')} />;
      case 'starterplayer': return <UserPlus {...getProps('text-[#FDD835]')} />;
      case 'teams': return <Flag {...getProps('text-[#FDD835]')} />;
      case 'soundservice': return <Volume2 {...getProps('text-[#4FC3F7]')} />;
      case 'textchatservice': return <MessageSquare {...getProps('text-[#E0E0E0]')} />;
      default: return <Box {...getProps('text-[#8a8a8a]')} />;
    }
  };

  const filterTree = (nodes: TreeNodeData[], query: string): TreeNodeData[] => {
    if (!query) return nodes;
    
    const lowerQuery = query.toLowerCase();
    
    return nodes.map(node => {
      const newNode = { ...node };
      newNode.children = filterTree(node.children, query);
      
      const isMatch = newNode.name.toLowerCase().includes(lowerQuery) || newNode.children.length > 0;
      
      if (isMatch) {
        if (newNode.children.length > 0) newNode.expanded = true;
        return newNode;
      }
      
      return null;
    }).filter((node): node is TreeNodeData => node !== null);
  };

  const filteredTree = filterTree(displayTree, searchQuery);

  const renderTree = (nodes: TreeNodeData[], level = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          draggable={node.type !== 'service'}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={(e) => handleDragLeave(e, node.id)}
          onDrop={(e) => handleDrop(e, node.id)}
          className={`flex items-center h-[26px] px-2 cursor-default select-none whitespace-nowrap text-[12.5px] ${
            dropTargetId === node.id 
              ? 'bg-[#2a3d5c] ring-1 ring-inset ring-[#0078d7]' 
              : selectedId === node.id 
                ? 'bg-[#3a3d41]' 
                : 'hover:bg-[#2f2f2f]'
          } ${draggedId === node.id ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => setSelectedId(node.id)}
          onDoubleClick={() => openScriptTab(node)}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
        >
          <div
            className="w-4 h-4 flex items-center justify-center mr-1 text-neutral-400 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              updateActiveTree(prev => toggleExpand(node.id, prev));
            }}
          >
            {node.children.length > 0 && (
              node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            )}
          </div>
          {getNodeIcon(node.name, node.type)}
          
          {editingId === node.id ? (
            <input
              autoFocus
              type="text"
              className="flex-1 bg-[#1e1e1e] text-[#d6d6d6] border border-[#0078d7] outline-none px-1 text-[12.5px] h-5"
              defaultValue={node.name}
              onBlur={(e) => {
                handleRename(node.id, e.target.value);
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename(node.id, e.currentTarget.value);
                  setEditingId(null);
                } else if (e.key === 'Escape') {
                  setEditingId(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span 
              className="flex-1 overflow-hidden text-ellipsis text-[#d6d6d6]"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (node.type !== 'service') {
                  setEditingId(node.id);
                }
              }}
            >
              {node.name}
            </span>
          )}
        </div>
        {node.expanded && node.children.length > 0 && (
          <div>{renderTree(node.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  // Get active script code
  const currentScriptCode = scriptsCode[activeTabId] ?? '';
  const currentLineCount = (currentScriptCode.match(/\n/g) || []).length + 1;
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isScriptTab = activeTabId !== 'viewport' && activeTabId !== 'gameplay';

  // Live error squiggles: re-check syntax whenever the active script's code
  // changes, debounced so we don't recompile on every keystroke. Switching to
  // a different script tab clears stale markers immediately and re-lints fast,
  // since the content just changed out from under the same editor instance.
  useEffect(() => {
    if (!isScriptTab) {
      lintedTabRef.current = null;
      return;
    }

    const tabChanged = lintedTabRef.current !== activeTabId;
    lintedTabRef.current = activeTabId;

    if (lintTimeoutRef.current) clearTimeout(lintTimeoutRef.current);

    if (tabChanged) {
      const monacoInst = monacoApiRef.current;
      const model = codeEditorRef.current?.getModel();
      if (monacoInst && model) {
        monacoInst.editor.setModelMarkers(model, 'luau-diagnostics', []);
      }
      setSyntaxError(null);
      setWarningDiagnostics([]);
      lintTimeoutRef.current = setTimeout(() => runLuaLint(currentScriptCode), 80);
    } else {
      lintTimeoutRef.current = setTimeout(() => runLuaLint(currentScriptCode), 200);
    }

    return () => {
      if (lintTimeoutRef.current) clearTimeout(lintTimeoutRef.current);
    };
  }, [activeTabId, currentScriptCode, isScriptTab, runLuaLint]);

  const render3DElements = (nodes: TreeNodeData[]) => {
    const elements: React.ReactNode[] = [];
    
    const traverse = (items: TreeNodeData[]) => {
      for (const item of items) {
        if (item.type === 'spawnlocation' || item.name.toLowerCase() === 'spawnlocation' || item.name.toLowerCase() === 'baseplate' || item.type === 'object' || item.type === 'part') {
          elements.push(
            <DraggablePart 
              key={item.id} 
              node={item} 
              isSelected={selectedId === item.id}
              activeTool={activeTool}
              onClick={() => {
                if (activeTool !== 'select') setSelectedId(item.id);
              }}
              onTransformChange={(data) => {
                const updateNode = (nodes: TreeNodeData[]): TreeNodeData[] => {
                  return nodes.map(n => {
                    if (n.id === item.id) return { ...n, position: data.position, rotation: data.rotation, scale: data.scale };
                    return { ...n, children: updateNode(n.children) };
                  });
                };
                if (isRunning && activeTabId === 'gameplay') {
                   globalPhysicsEngine.syncTransform(item.id, data.position, data.rotation);
                   setRuntimeTree(updateNode(runtimeTree));
                } else {
                   setTree(updateNode(tree));
                }
              }}
            />
          );
        }
        if (item.children.length > 0) {
          traverse(item.children);
        }
      }
    };

    traverse(nodes);
    return elements;
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-screen bg-black text-[#d6d6d6] font-sans overflow-hidden select-none">
      
      {/* LEFT PANEL: EXPLORER & PROPERTIES */}
      <aside className="w-full md:w-[320px] md:min-w-[260px] md:max-w-[480px] flex-shrink-0 flex flex-col bg-[#1e1e1e] border-b md:border-b-0 md:border-r border-[#050505] h-full">
        {/* EXPLORER SECTION */}
        <div className="flex-1 flex flex-col min-h-[160px] overflow-hidden">
          <div className="h-[34px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-b border-[#050505]">
            <span className="text-[13px] font-medium tracking-wide">Explorer</span>
            <span className="text-[11px] text-[#8a8a8a]">Right click to add</span>
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
            <div className="flex-shrink-0 flex items-center gap-1">
              <input
                type="text"
                placeholder="Filter workspace..."
                className="flex-1 bg-[#252526] text-[#cccccc] border border-[#3e3e42] rounded-sm px-2 py-1 text-[12px] focus:outline-none focus:border-[#0078d7]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button 
                className="h-[26px] w-[26px] flex items-center justify-center bg-[#252526] border border-[#3e3e42] rounded-sm text-[#cccccc] hover:bg-[#333333] transition-colors"
                onClick={() => setSearchQuery('')}
                title="Reset Search"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {renderTree(filteredTree)}
            </div>
          </div>
        </div>

        {/* PROPERTIES SECTION */}
        <PropertiesPanel
          selectedNode={selectedId ? findNodeById(displayTree, selectedId) : null}
          tree={displayTree}
          onUpdateProperty={(nodeId, property, value) => {
            const updateNode = (nodes: TreeNodeData[]): TreeNodeData[] =>
              nodes.map((node) => {
                if (node.id === nodeId) {
                  if (property === 'name') {
                    setTabs((prev) => prev.map((t) => (t.id === nodeId ? { ...t, name: value } : t)));
                  }
                  return { ...node, [property]: value };
                }
                return { ...node, children: updateNode(node.children) };
              });
            updateActiveTree((prev) => updateNode(prev));
          }}
        />
      </aside>

      {/* RIGHT PANEL: MAIN WORKSPACE */}
      <main className="flex-1 min-w-0 flex flex-col bg-[#35363a]">
        
        {/* TOP TOOLBAR */}
        <div className="h-[40px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-b border-[#050505]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handlePlay()}
              className={`flex items-center gap-1.5 text-white border-none px-3.5 py-1.5 rounded-[3px] text-[13px] font-medium cursor-pointer transition-colors ${
                isRunning 
                  ? 'bg-[#d9534f] hover:bg-[#c9302c]' 
                  : 'bg-[#0078d7] hover:bg-[#0063b1]'
              }`}
            >
              {isRunning ? (
                <>
                  <Square size={13} fill="currentColor" /> Stop
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" /> Play
                </>
              )}
            </button>
            
            <div className="w-[1px] h-[20px] bg-[#3e3e42] mx-2"></div>
            
            <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded-[3px] border border-[#3e3e42]">
              <button 
                onClick={() => setActiveTool('select')}
                className={`p-1.5 rounded-sm transition-colors ${activeTool === 'select' ? 'bg-[#0078d7] text-white' : 'text-[#cccccc] hover:bg-[#333333]'}`}
                title="Select"
              >
                <MousePointer2 size={14} />
              </button>
              <button 
                onClick={() => setActiveTool('translate')}
                className={`p-1.5 rounded-sm transition-colors ${activeTool === 'translate' ? 'bg-[#0078d7] text-white' : 'text-[#cccccc] hover:bg-[#333333]'}`}
                title="Move"
              >
                <Move size={14} />
              </button>
              <button 
                onClick={() => setActiveTool('scale')}
                className={`p-1.5 rounded-sm transition-colors ${activeTool === 'scale' ? 'bg-[#0078d7] text-white' : 'text-[#cccccc] hover:bg-[#333333]'}`}
                title="Scale"
              >
                <Maximize size={14} />
              </button>
              <button 
                onClick={() => setActiveTool('rotate')}
                className={`p-1.5 rounded-sm transition-colors ${activeTool === 'rotate' ? 'bg-[#0078d7] text-white' : 'text-[#cccccc] hover:bg-[#333333]'}`}
                title="Rotate"
              >
                <RotateCw size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-[#9ca3af]">
            <span className="font-semibold text-[13px] text-[#e0e0e0] tracking-wide">
              Visual Luau Compiler Online
            </span>
            <div className="w-[1px] h-[16px] bg-[#3e3e42]"></div>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#10b981] inline-block animate-pulse"></span>
              Wasmoon Lua
            </span>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="h-[34px] flex-shrink-0 flex items-center bg-[#252526] overflow-x-auto custom-scrollbar flex-nowrap shadow-sm z-10">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`h-full flex items-center px-3 border-r border-[#1e1e1e] cursor-pointer select-none transition-colors min-w-fit ${
                  isActive 
                    ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#0078d7]' 
                    : 'bg-[#2d2d2d] text-[#8a8a8a] hover:bg-[#252526] border-t-2 border-t-transparent'
                }`}
              >
                {/* Script tab icons — Roblox icons with Lucide fallback */}
                {tab.type === 'script' && (
                  getRobloxIconUrl(tab.name, 'script')
                    ? <img src={getRobloxIconUrl(tab.name, 'script')!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FileCode size={14} className="text-[#a3e681]" />
                )}
                {tab.type === 'localscript' && (
                  getRobloxIconUrl(tab.name, 'localscript')
                    ? <img src={getRobloxIconUrl(tab.name, 'localscript')!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FileCode size={14} className="text-[#38bdf8]" />
                )}
                {tab.type === 'modulescript' && (
                  getRobloxIconUrl(tab.name, 'modulescript')
                    ? <img src={getRobloxIconUrl(tab.name, 'modulescript')!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FileJson size={14} className="text-[#f59e0b]" />
                )}
                
                {tab.type === 'viewport' && tab.id === 'viewport' && (
                  getRobloxIconUrl('Workspace')
                    ? <img src={getRobloxIconUrl('Workspace')!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <Globe size={14} className="text-[#4FC3F7]" />
                )}
                
                {tab.id === 'gameplay' && (
                  <div className="flex items-center">
                    {gameplayMode === 'server' ? (
                      <Globe size={14} className="text-[#4FC3F7]" />
                    ) : (
                      <Monitor size={14} className="text-[#10b981]" />
                    )}
                  </div>
                )}
                
                <span className="text-[12.5px] whitespace-nowrap font-medium ml-1.5">
                  {tab.id === 'gameplay' 
                    ? (gameplayMode === 'server' ? 'Server Gameplay' : 'Local Gameplay')
                    : tab.name}
                </span>

                {tab.id === 'gameplay' && (
                  <div className="relative ml-1 flex items-center">
                    <button
                      className="w-4 h-4 rounded-sm flex items-center justify-center hover:bg-[#444] text-[#8a8a8a] hover:text-[#d4d4d4] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (showModeDropdown) {
                          setShowModeDropdown(false);
                          setDropdownPos(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowModeDropdown(true);
                          setDropdownPos({ top: rect.bottom + 4, left: rect.left });
                        }
                      }}
                      title="Switch Gameplay Mode"
                    >
                      <ChevronDown size={12} />
                    </button>
                    {showModeDropdown && isActive && dropdownPos && (
                      <div 
                        className="fixed w-[160px] bg-[#252526] border border-[#333333] rounded shadow-lg z-[9999] overflow-hidden"
                        style={{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }}
                      >
                        <div 
                          className="px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-[#0078d7] text-[#cccccc] hover:text-white cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGameplayMode('server');
                            setShowModeDropdown(false);
                          }}
                        >
                          <Globe size={13} className="text-[#4FC3F7]" />
                          <span>Server Gameplay</span>
                        </div>
                        <div 
                          className="px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-[#0078d7] text-[#cccccc] hover:text-white cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGameplayMode('client');
                            setShowModeDropdown(false);
                          }}
                        >
                          <Monitor size={13} className="text-[#10b981]" />
                          <span>Local Gameplay</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {tab.type !== 'viewport' && (
                  <button
                    className="w-4 h-4 rounded-sm flex items-center justify-center hover:bg-[#444] ml-1 text-[#8a8a8a] hover:text-[#d4d4d4] transition-colors"
                    onClick={(e) => closeTab(tab.id, e)}
                    title="Close tab"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* MAIN VIEWPORT / CODE EDITOR */}
        <div className="flex-1 min-h-0 relative flex flex-col bg-[#1e1e1e]">
          {activeTabId === 'viewport' || activeTabId === 'gameplay' ? (
            /* 3D VIEWPORT */
            <div className="flex-1 relative overflow-hidden bg-[#0b1220]">
              <Canvas 
                shadows
                camera={{ position: [24, 16, 28], fov: 50 }}
                onPointerMissed={() => {
                  if (activeTool !== 'select') setSelectedId(null);
                }}
              >
                <SceneLighting node={displayTree.find((n) => n.id === 'lighting')} />
                
                {render3DElements(displayTree)}
                
                <PhysicsSimulator
                  isRunning={isRunning && activeTabId === 'gameplay'}
                  getTree={() => (gameplayMode === 'server' ? serverRuntimeTreeRef.current : clientRuntimeTreeRef.current)}
                  onPhysicsStep={(updates) => {
                    const setPhysicsTree = gameplayMode === 'server' ? setServerRuntimeTree : setClientRuntimeTree;
                    setPhysicsTree((prevTree) => {
                      const updateNodes = (nodes: TreeNodeData[]): TreeNodeData[] =>
                        nodes.map((n) => {
                          const upd = updates.get(n.id);
                          if (upd) {
                            return { ...n, position: upd.position, rotation: upd.rotation, children: updateNodes(n.children) };
                          }
                          return { ...n, children: updateNodes(n.children) };
                        });
                      return updateNodes(prevTree);
                    });
                  }}
                />

                <StudioControls />
              </Canvas>
            </div>
          ) : (
            /* CODE EDITOR */
            <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
              <div className="flex-1 flex min-h-0 overflow-hidden font-mono text-[13px]">
                <Editor
                  height="100%"
                  defaultLanguage="lua"
                  theme="roblox-studio-dark"
                  value={currentScriptCode}
                  onChange={(value) => setScriptsCode({ ...scriptsCode, [activeTabId]: value || '' })}
                  beforeMount={(monaco) => {
                    setupRobloxStudioTheme(monaco);
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'monospace',
                    scrollBeyondLastLine: false,
                    padding: { top: 10 },
                    tabSize: 4,
                    autoIndent: 'full',
                    formatOnType: true,
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    quickSuggestions: { other: true, comments: false, strings: true },
                    suggestOnTriggerCharacters: true,
                  }}
                  onMount={(editor, monaco) => {
                    setupRobloxStudioEditor(editor, monaco);
                    codeEditorRef.current = editor;
                    monacoApiRef.current = monaco;
                    editor.onDidChangeCursorPosition((e) => {
                      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                    });
                    // Lint immediately on first mount so squiggles show up
                    // without waiting for the first edit.
                    lintedTabRef.current = activeTabId;
                    runLuaLint(currentScriptCode);
                  }}
                />
              </div>

              {/* EDITOR STATUS BAR */}
              <div className="h-[22px] flex-shrink-0 flex items-center justify-between px-3 bg-[#181818] border-t border-[#2d2d2d] text-[11px] text-[#8a8a8a]">
                <div className="flex items-center gap-3">
                  <span>Luau / Lua 5.1 (Wasmoon)</span>
                  <span>UTF-8</span>
                  {/* Red Syntax Error Indicator */}
                  {syntaxError && (
                    <button
                      className="flex items-center gap-1 min-w-0 max-w-[280px] text-[#ff4d4d] hover:text-[#ff8080] transition-colors cursor-pointer"
                      title={`Syntax error on line ${syntaxError.line}: ${syntaxError.message}`}
                      onClick={() => {
                        const editorInst = codeEditorRef.current;
                        if (!editorInst) return;
                        editorInst.revealLineInCenter(syntaxError.line);
                        editorInst.setPosition({ lineNumber: syntaxError.line, column: 1 });
                        editorInst.focus();
                      }}
                    >
                      <AlertCircle size={12} className="flex-shrink-0 text-[#ff4d4d]" />
                      <span className="truncate">Error Ln {syntaxError.line}: {syntaxError.message}</span>
                    </button>
                  )}

                  {/* Yellow Warning Indicator */}
                  {warningDiagnostics.length > 0 && (
                    <button
                      className="flex items-center gap-1 min-w-0 max-w-[280px] text-[#ffbf00] hover:text-[#ffd54f] transition-colors cursor-pointer"
                      title={`${warningDiagnostics.length} warning${warningDiagnostics.length > 1 ? 's' : ''}: ${warningDiagnostics[0].message}`}
                      onClick={() => {
                        const editorInst = codeEditorRef.current;
                        if (!editorInst || !warningDiagnostics[0]) return;
                        const w = warningDiagnostics[0];
                        editorInst.revealLineInCenter(w.startLineNumber);
                        editorInst.setPosition({ lineNumber: w.startLineNumber, column: w.startColumn });
                        editorInst.focus();
                      }}
                    >
                      <AlertTriangle size={12} className="flex-shrink-0 text-[#ffbf00]" />
                      <span className="truncate">{warningDiagnostics.length} Warning{warningDiagnostics.length > 1 ? 's' : ''} (Ln {warningDiagnostics[0].startLineNumber})</span>
                    </button>
                  )}

                  {!syntaxError && warningDiagnostics.length === 0 && (
                    <span className="flex items-center gap-1 text-[#6a9955]">
                      <CheckCircle2 size={12} />
                      No problems
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                  <span>{currentLineCount} lines</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OUTPUT PANEL */}
        <div className="h-[200px] flex-shrink-0 flex flex-col bg-[#1e1e1e] border-t border-[#050505]">
          <div className="h-[28px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-b border-[#050505]">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium tracking-wide">Output</span>
              <span className="text-[10px] bg-[#3a3a3a] px-1.5 py-0.5 rounded text-[#a0a0a0]">
                {logs.length} messages
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button 
                className="h-5 px-2 flex items-center gap-1 rounded-[3px] text-[11px] text-[#8a8a8a] hover:bg-[#444444] hover:text-[#d6d6d6] transition-colors"
                onClick={clearOutput}
                title="Clear Output"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 bg-[#1e1e1e] font-mono text-[12px] space-y-1 select-text">
            {logs.length === 0 ? (
              <div className="text-[#555] italic">No output logs</div>
            ) : (
              logs.map((log) => {
                let colorClass = 'text-[#e0e0e0]';
                let Icon = null;

                if (log.type === 'print') {
                  colorClass = 'text-[#75b0e2]';
                } else if (log.type === 'warn') {
                  colorClass = 'text-[#ffb74d]';
                  Icon = AlertTriangle;
                } else if (log.type === 'error') {
                  colorClass = 'text-[#f87171] font-semibold';
                  Icon = AlertCircle;
                } else if (log.type === 'system') {
                  colorClass = 'text-[#9ca3af]';
                }

                return (
                  <div key={log.id} className={`flex items-start gap-2 leading-relaxed break-all ${colorClass}`}>
                    <span className="text-[#666666] select-none text-[11px] flex-shrink-0 font-normal">
                      {log.timestamp}
                    </span>
                    {Icon && <Icon size={13} className="flex-shrink-0 mt-0.5" />}
                    <span className="whitespace-pre-wrap">{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={outputEndRef} />
          </div>
        </div>

        {/* BOTTOM STATUS BAR */}
        <div className="h-[24px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-t border-[#050505] text-[11.5px] text-[#8a8a8a]">
          <div className="flex items-center gap-2">
            <span>Select</span>
            <span className="text-[#4a4a4a]">|</span>
            <span>{selectedId ? '1 object selected' : '0 objects selected'}</span>
          </div>

          <div>
            {isRunning ? (
              <span className="text-[#4CAF50] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] animate-ping"></span>
                Running...
              </span>
            ) : (
              <span>Ready</span>
            )}
          </div>
        </div>
      </main>

      {/* CONTEXT MENU */}
      {contextMenu.visible && (() => {
        const targetId = contextMenu.targetId || 'workspace';

        return (
          <div
            className="fixed z-50 w-52 bg-[#2c2c2c] border border-[#050505] shadow-2xl rounded-[4px] flex flex-col max-h-[300px] select-none"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="flex-shrink-0 px-3 py-1.5 bg-[#252525] border-b border-[#383838] flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-wider">
                Insert Object
              </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
              {/* Containers & 3D */}
              {([
                ['model', 'Model', Boxes, 'text-[#00bcd4]'],
                ['folder', 'Folder', Folder, 'text-[#fdd835]'],
                ['object', 'Part', Box, 'text-[#8a8a8a]'],
                ['decal', 'Decal', ImageIcon, 'text-[#f472b6]'],
                ['texture', 'Texture', Grid, 'text-[#38bdf8]'],
              ] as const).map(([objType, label, FallbackIcon, colorClass]) => (
                <button
                  key={objType}
                  className="group w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#0078d7] hover:text-white flex items-center gap-2"
                  onClick={() => insertObject(targetId, objType)}
                >
                  {getRobloxIconUrl(label, objType)
                    ? <img src={getRobloxIconUrl(label, objType)!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FallbackIcon size={14} className={`${colorClass} group-hover:text-white`} />
                  } {label}
                </button>
              ))}
              
              <div className="my-1 border-t border-[#3f3f3f]" />

              {/* Scripts */}
              {([
                ['script', 'Script', FileCode, 'text-[#a3e681]'],
                ['localscript', 'LocalScript', FileCode, 'text-[#38bdf8]'],
                ['modulescript', 'ModuleScript', FileJson, 'text-[#f59e0b]'],
              ] as const).map(([objType, label, FallbackIcon, colorClass]) => (
                <button
                  key={objType}
                  className="group w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#0078d7] hover:text-white flex items-center gap-2"
                  onClick={() => insertObject(targetId, objType)}
                >
                  {getRobloxIconUrl(label, objType)
                    ? <img src={getRobloxIconUrl(label, objType)!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FallbackIcon size={14} className={`${colorClass} group-hover:text-white`} />
                  } {label}
                </button>
              ))}

              <div className="my-1 border-t border-[#3f3f3f]" />

              {/* Lights */}
              {([
                ['pointlight', 'PointLight', Lightbulb, 'text-[#ffca28]'],
                ['spotlight', 'SpotLight', Lightbulb, 'text-[#ffca28]'],
                ['surfacelight', 'SurfaceLight', Lightbulb, 'text-[#ffca28]'],
              ] as const).map(([objType, label, FallbackIcon, colorClass]) => (
                <button
                  key={objType}
                  className="group w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#0078d7] hover:text-white flex items-center gap-2"
                  onClick={() => insertObject(targetId, objType)}
                >
                  {getRobloxIconUrl(label, objType)
                    ? <img src={getRobloxIconUrl(label, objType)!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FallbackIcon size={14} className={`${colorClass} group-hover:text-white`} />
                  } {label}
                </button>
              ))}

              <div className="my-1 border-t border-[#3f3f3f]" />

              {/* Networking */}
              {([
                ['remoteevent', 'RemoteEvent', Zap, 'text-[#fb923c]'],
                ['remotefunction', 'RemoteFunction', ArrowLeftRight, 'text-[#c084fc]'],
              ] as const).map(([objType, label, FallbackIcon, colorClass]) => (
                <button
                  key={objType}
                  className="group w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#0078d7] hover:text-white flex items-center gap-2"
                  onClick={() => insertObject(targetId, objType)}
                >
                  {getRobloxIconUrl(label, objType)
                    ? <img src={getRobloxIconUrl(label, objType)!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FallbackIcon size={14} className={`${colorClass} group-hover:text-white`} />
                  } {label}
                </button>
              ))}

              <div className="my-1 border-t border-[#3f3f3f]" />

              {/* Environment & Effects */}
              {([
                ['sky', 'Sky', Cloud, 'text-[#64b5f6]'],
                ['atmosphere', 'Atmosphere', Flame, 'text-[#ff8a65]'],
                ['colorcorrectioneffect', 'ColorCorrectionEffect', Sliders, 'text-[#4dd0e1]'],
                ['bloomeffect', 'BloomEffect', Sparkles, 'text-[#ffd54f]'],
                ['sunrayseffect', 'SunRaysEffect', Sun, 'text-[#ffb74d]'],
                ['blureffect', 'BlurEffect', Eye, 'text-[#ba68c8]'],
              ] as const).map(([objType, label, FallbackIcon, colorClass]) => (
                <button
                  key={objType}
                  className="group w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#0078d7] hover:text-white flex items-center gap-2"
                  onClick={() => insertObject(targetId, objType)}
                >
                  {getRobloxIconUrl(label, objType)
                    ? <img src={getRobloxIconUrl(label, objType)!} alt="" className="w-3.5 h-3.5 flex-shrink-0 object-contain select-none pointer-events-none" draggable={false} />
                    : <FallbackIcon size={14} className={`${colorClass} group-hover:text-white`} />
                  } {label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}