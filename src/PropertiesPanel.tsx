import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  X
} from 'lucide-react';
import { TreeNodeData, findParentNode, LIGHTING_DEFAULTS, clockTimeToTimeOfDay, timeOfDayToClockTime } from './luaRunner';

export const BRICK_COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: 'Medium stone grey', hex: '#a3a2a5' },
  { name: 'Dark stone grey', hex: '#635f62' },
  { name: 'Light stone grey', hex: '#e5e3df' },
  { name: 'Bright red', hex: '#c4281c' },
  { name: 'Bright blue', hex: '#0d69ac' },
  { name: 'Bright green', hex: '#287f46' },
  { name: 'Bright yellow', hex: '#f5cd2f' },
  { name: 'Bright orange', hex: '#da8541' },
  { name: 'Bright violet', hex: '#6b327c' },
  { name: 'White', hex: '#f2f3f3' },
  { name: 'Black', hex: '#1b2a34' },
  { name: 'Really red', hex: '#ff0000' },
  { name: 'Really black', hex: '#000000' },
  { name: 'Really blue', hex: '#0000ff' },
  { name: 'Lime green', hex: '#00ff00' },
  { name: 'Hot pink', hex: '#ff66cc' },
  { name: 'Institutional white', hex: '#f8f8f8' },
  { name: 'Sand blue', hex: '#74869d' },
  { name: 'Earth green', hex: '#27462d' },
  { name: 'Nougat', hex: '#cc8e69' },
  { name: 'Brown', hex: '#7c5c44' },
];

export const MATERIALS_LIST = [
  'Plastic',
  'SmoothPlastic',
  'Neon',
  'Wood',
  'Metal',
  'Glass',
];

export const SHAPES_LIST = ['Block', 'Ball', 'Cylinder'];
export const FACES_LIST = ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right'];

interface PropertiesPanelProps {
  selectedNode: TreeNodeData | null;
  tree: TreeNodeData[];
  onUpdateProperty: (nodeId: string, property: keyof TreeNodeData, value: any) => void;
  onClose?: () => void;
}

export function PropertiesPanel({
  selectedNode,
  tree,
  onUpdateProperty,
  onClose,
}: PropertiesPanelProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    collision: true,
    part: true,
    lighting: true,
    light: true,
    sky: true,
    atmosphere: true,
    effect: true,
    texture: true,
    data: true,
  });

  const [expandedVectors, setExpandedVectors] = useState<Record<string, boolean>>({
    position: false,
    orientation: false,
    size: false,
  });

  const filterInputRef = useRef<HTMLInputElement>(null);

  // Shortcut Ctrl + Shift + P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        filterInputRef.current?.focus();
        filterInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleVector = (vectorKey: string) => {
    setExpandedVectors((prev) => ({ ...prev, [vectorKey]: !prev[vectorKey] }));
  };

  if (!selectedNode) {
    return (
      <div className="flex-1 flex flex-col bg-[#1e1e1e] border-t border-[#050505] text-[#d6d6d6] select-none min-h-0">
        <div className="h-[30px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-b border-[#050505]">
          <span className="text-[12.5px] font-medium tracking-wide">Properties</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[#666666] text-[12px] italic">
          Select an object in the Explorer or Viewport to view its properties
        </div>
      </div>
    );
  }

  const nodeTypeLower = selectedNode.type.toLowerCase();
  const nodeNameLower = selectedNode.name.toLowerCase();

  const isPart =
    selectedNode.type === 'object' ||
    selectedNode.type === 'part' ||
    selectedNode.type === 'spawnlocation' ||
    nodeNameLower === 'baseplate' ||
    nodeNameLower === 'part';

  const isScript = ['script', 'localscript', 'modulescript'].includes(selectedNode.type);
  const isLighting = selectedNode.id === 'lighting' || nodeNameLower === 'lighting';
  const isLight = ['pointlight', 'spotlight', 'surfacelight'].includes(nodeTypeLower);
  const isSky = nodeTypeLower === 'sky';
  const isAtmosphere = nodeTypeLower === 'atmosphere';
  const isEffect = [
    'colorcorrectioneffect',
    'bloomeffect',
    'sunrayseffect',
    'blureffect',
    'depthoffieldeffect',
  ].includes(nodeTypeLower);

  const isDecal = nodeTypeLower === 'decal';
  const isTexture = nodeTypeLower === 'texture';
  const isDecalOrTexture = isDecal || isTexture;

  const parentNode = findParentNode(tree, selectedNode.id);
  const parentName = parentNode ? parentNode.name : 'Workspace';

  const pos = selectedNode.position || (nodeNameLower === 'baseplate' ? [0, -0.5, 0] : [0, 5, 0]);
  const rot = selectedNode.rotation || [0, 0, 0];
  const degRot = [
    Math.round(((rot[0] * 180) / Math.PI) * 100) / 100,
    Math.round(((rot[1] * 180) / Math.PI) * 100) / 100,
    Math.round(((rot[2] * 180) / Math.PI) * 100) / 100,
  ];
  const size = selectedNode.size || (nodeNameLower === 'baseplate' ? [512, 1, 512] : [4, 4, 4]);

  const color = selectedNode.color || (nodeNameLower === 'baseplate' ? '#3b593f' : '#a3a2a5');
  const matchedBrick = BRICK_COLOR_PALETTE.find((b) => b.hex.toLowerCase() === color.toLowerCase());
  const brickColorName = matchedBrick ? matchedBrick.name : 'Custom';

  const filterMatch = (label: string) => {
    if (!filterQuery.trim()) return true;
    return label.toLowerCase().includes(filterQuery.toLowerCase().trim());
  };

  const getClassName = () => {
    if (selectedNode.id === 'workspace') return 'Workspace';
    if (selectedNode.id === 'lighting') return 'Lighting';
    if (selectedNode.type === 'object' || selectedNode.type === 'part') return 'Part';
    if (selectedNode.type === 'spawnlocation') return 'SpawnLocation';
    if (selectedNode.type === 'script') return 'Script';
    if (selectedNode.type === 'localscript') return 'LocalScript';
    if (selectedNode.type === 'modulescript') return 'ModuleScript';
    if (selectedNode.type === 'remoteevent') return 'RemoteEvent';
    if (selectedNode.type === 'remotefunction') return 'RemoteFunction';
    if (selectedNode.type === 'camera') return 'Camera';
    if (selectedNode.type === 'terrain') return 'Terrain';
    if (selectedNode.type === 'folder' || selectedNode.type === 'folder_script') return 'Folder';
    if (selectedNode.type === 'model') return 'Model';
    if (selectedNode.type === 'decal') return 'Decal';
    if (selectedNode.type === 'texture') return 'Texture';
    if (selectedNode.type === 'pointlight') return 'PointLight';
    if (selectedNode.type === 'spotlight') return 'SpotLight';
    if (selectedNode.type === 'surfacelight') return 'SurfaceLight';
    if (selectedNode.type === 'sky') return 'Sky';
    if (selectedNode.type === 'atmosphere') return 'Atmosphere';
    if (selectedNode.type === 'colorcorrectioneffect') return 'ColorCorrectionEffect';
    if (selectedNode.type === 'bloomeffect') return 'BloomEffect';
    if (selectedNode.type === 'sunrayseffect') return 'SunRaysEffect';
    if (selectedNode.type === 'blureffect') return 'BlurEffect';
    if (selectedNode.type === 'depthoffieldeffect') return 'DepthOfFieldEffect';
    return selectedNode.name;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] border-t border-[#050505] text-[#d6d6d6] select-none min-h-0 font-sans">
      
      {/* HEADER */}
      <div className="h-[30px] flex-shrink-0 flex items-center justify-between px-3 bg-[#2c2c2c] border-b border-[#050505]">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-[12.5px] font-medium tracking-wide whitespace-nowrap">
            Properties - {getClassName()} "{selectedNode.name}"
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-4 h-4 rounded-sm flex items-center justify-center hover:bg-[#444] text-[#8a8a8a] hover:text-[#d4d4d4]"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* FILTER PROPERTIES INPUT */}
      <div className="p-1.5 bg-[#252526] border-b border-[#333333] flex items-center gap-1">
        <div className="relative flex-1">
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter Properties (Ctrl+Shift+P)"
            className="w-full bg-[#1e1e1e] text-[#cccccc] placeholder-[#666666] border border-[#3e3e42] rounded-sm pl-2 pr-6 py-1 text-[11.5px] focus:outline-none focus:border-[#0078d7]"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#cccccc]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* PROPERTIES LIST (FUNCTIONAL ONLY) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar text-[12px]">

        {/* ================= COLLISION SECTION ================= */}
        {isPart && (filterMatch('CanCollide') || filterMatch('CanTouch')) && (
          <div>
            <div
              onClick={() => toggleSection('collision')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.collision ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Collision
            </div>

            {expandedSections.collision && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {/* CanCollide */}
                {filterMatch('CanCollide') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">CanCollide</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.canCollide !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'canCollide', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {/* CanTouch */}
                {filterMatch('CanTouch') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">CanTouch</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.canTouch !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'canTouch', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= PART SECTION (DATA & TRANSFORM) ================= */}
        {isPart && (
          filterMatch('Anchored') || 
          filterMatch('Shape') || 
          filterMatch('Material') || 
          filterMatch('Color') || 
          filterMatch('BrickColor') || 
          filterMatch('Transparency') || 
          filterMatch('Position') || 
          filterMatch('Orientation') || 
          filterMatch('Size')
        ) && (
          <div>
            <div
              onClick={() => toggleSection('part')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.part ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Part
            </div>

            {expandedSections.part && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {/* Anchored */}
                {filterMatch('Anchored') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Anchored</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.anchored !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'anchored', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {/* Shape */}
                {filterMatch('Shape') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Shape</span>
                    <div className="w-[55%]">
                      <select
                        value={selectedNode.shape || 'Block'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'shape', e.target.value)}
                        className="w-full bg-[#181818] text-[#cccccc] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11.5px] outline-none cursor-pointer"
                      >
                        {SHAPES_LIST.map((sh) => (
                          <option key={sh} value={sh}>
                            {sh}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Material */}
                {filterMatch('Material') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Material</span>
                    <div className="w-[55%]">
                      <select
                        value={selectedNode.material || 'Plastic'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'material', e.target.value)}
                        className="w-full bg-[#181818] text-[#cccccc] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11.5px] outline-none cursor-pointer"
                      >
                        {MATERIALS_LIST.map((mat) => (
                          <option key={mat} value={mat}>
                            {mat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Color */}
                {filterMatch('Color') && (
                  <div className="flex items-center h-[28px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Color</span>
                    <div className="w-[55%] flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'color', e.target.value)}
                        className="w-6 h-5 rounded cursor-pointer border border-[#444] bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'color', e.target.value)}
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none uppercase"
                      />
                    </div>
                  </div>
                )}

                {/* BrickColor */}
                {filterMatch('BrickColor') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">BrickColor</span>
                    <div className="w-[55%]">
                      <select
                        value={brickColorName}
                        onChange={(e) => {
                          const item = BRICK_COLOR_PALETTE.find((b) => b.name === e.target.value);
                          if (item) onUpdateProperty(selectedNode.id, 'color', item.hex);
                        }}
                        className="w-full bg-[#181818] text-[#cccccc] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11.5px] outline-none cursor-pointer"
                      >
                        {BRICK_COLOR_PALETTE.map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Transparency */}
                {filterMatch('Transparency') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Transparency</span>
                    <div className="w-[55%] flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.transparency ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'transparency',
                            Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Position */}
                {filterMatch('Position') && (
                  <div>
                    <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                      <div
                        onClick={() => toggleVector('position')}
                        className="w-[45%] flex items-center cursor-pointer text-[#cccccc]"
                      >
                        <span className="mr-1 text-[#888888]">
                          {expandedVectors.position ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="truncate">Position</span>
                      </div>
                      <div className="w-[55%] text-[#cccccc] font-mono text-[11px] truncate">
                        {pos[0]}, {pos[1]}, {pos[2]}
                      </div>
                    </div>
                    {expandedVectors.position && (
                      <div className="pl-6 pr-3 py-1 space-y-1 bg-[#181818] border-t border-[#252526]">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <div key={axis} className="flex items-center h-[22px] text-[11px]">
                            <span className="w-6 text-[#888888] font-bold">{axis}</span>
                            <input
                              type="number"
                              value={pos[i]}
                              onChange={(e) => {
                                const newPos: [number, number, number] = [...pos];
                                newPos[i] = parseFloat(e.target.value) || 0;
                                onUpdateProperty(selectedNode.id, 'position', newPos);
                              }}
                              className="flex-1 bg-[#222222] border border-[#333333] focus:border-[#0078d7] px-1 py-0.5 rounded font-mono text-[#cccccc] outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Orientation */}
                {filterMatch('Orientation') && (
                  <div>
                    <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                      <div
                        onClick={() => toggleVector('orientation')}
                        className="w-[45%] flex items-center cursor-pointer text-[#cccccc]"
                      >
                        <span className="mr-1 text-[#888888]">
                          {expandedVectors.orientation ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="truncate">Orientation</span>
                      </div>
                      <div className="w-[55%] text-[#cccccc] font-mono text-[11px] truncate">
                        {degRot[0]}, {degRot[1]}, {degRot[2]}
                      </div>
                    </div>
                    {expandedVectors.orientation && (
                      <div className="pl-6 pr-3 py-1 space-y-1 bg-[#181818] border-t border-[#252526]">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <div key={axis} className="flex items-center h-[22px] text-[11px]">
                            <span className="w-6 text-[#888888] font-bold">{axis}</span>
                            <input
                              type="number"
                              value={degRot[i]}
                              onChange={(e) => {
                                const deg = parseFloat(e.target.value) || 0;
                                const newRot: [number, number, number] = [...rot];
                                newRot[i] = (deg * Math.PI) / 180;
                                onUpdateProperty(selectedNode.id, 'rotation', newRot);
                              }}
                              className="flex-1 bg-[#222222] border border-[#333333] focus:border-[#0078d7] px-1 py-0.5 rounded font-mono text-[#cccccc] outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Size */}
                {filterMatch('Size') && (
                  <div>
                    <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                      <div
                        onClick={() => toggleVector('size')}
                        className="w-[45%] flex items-center cursor-pointer text-[#cccccc]"
                      >
                        <span className="mr-1 text-[#888888]">
                          {expandedVectors.size ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="truncate">Size</span>
                      </div>
                      <div className="w-[55%] text-[#cccccc] font-mono text-[11px] truncate">
                        {size[0]}, {size[1]}, {size[2]}
                      </div>
                    </div>
                    {expandedVectors.size && (
                      <div className="pl-6 pr-3 py-1 space-y-1 bg-[#181818] border-t border-[#252526]">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <div key={axis} className="flex items-center h-[22px] text-[11px]">
                            <span className="w-6 text-[#888888] font-bold">{axis}</span>
                            <input
                              type="number"
                              value={size[i]}
                              onChange={(e) => {
                                const newSize: [number, number, number] = [...size];
                                newSize[i] = Math.max(0.01, parseFloat(e.target.value) || 1);
                                onUpdateProperty(selectedNode.id, 'size', newSize);
                              }}
                              className="flex-1 bg-[#222222] border border-[#333333] focus:border-[#0078d7] px-1 py-0.5 rounded font-mono text-[#cccccc] outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= LIGHTING SECTION ================= */}
        {isLighting && (
          filterMatch('Ambient') ||
          filterMatch('OutdoorAmbient') ||
          filterMatch('Brightness') ||
          filterMatch('ColorShift_Top') ||
          filterMatch('ColorShift_Bottom') ||
          filterMatch('ClockTime') ||
          filterMatch('TimeOfDay') ||
          filterMatch('GeographicLatitude') ||
          filterMatch('FogColor') ||
          filterMatch('FogStart') ||
          filterMatch('FogEnd') ||
          filterMatch('GlobalShadows') ||
          filterMatch('ShadowSoftness') ||
          filterMatch('ExposureCompensation') ||
          filterMatch('EnvironmentDiffuseScale') ||
          filterMatch('EnvironmentSpecularScale') ||
          filterMatch('SkyEnabled') ||
          filterMatch('FogEnabled') ||
          filterMatch('AmbientIntensity') ||
          filterMatch('SunAngle')
        ) && (
          <div>
            <div
              onClick={() => toggleSection('lighting')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.lighting ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Lighting
            </div>

            {expandedSections.lighting && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {/* ClockTime with quick slider and number input */}
                {filterMatch('ClockTime') && (
                  <div className="flex items-center h-[28px] hover:bg-[#252526] px-3 gap-2">
                    <span className="w-[40%] text-[#cccccc] truncate">ClockTime</span>
                    <div className="w-[60%] flex items-center gap-1.5">
                      <input
                        type="range"
                        min="0"
                        max="24"
                        step="0.05"
                        value={selectedNode.clockTime ?? LIGHTING_DEFAULTS.clockTime}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'clockTime', parseFloat(e.target.value) || 0)}
                        className="flex-1 accent-[#0078d7] cursor-pointer h-1.5 bg-[#333333] rounded"
                      />
                      <input
                        type="number"
                        min="0"
                        max="24"
                        step="0.1"
                        value={Math.round((selectedNode.clockTime ?? LIGHTING_DEFAULTS.clockTime) * 100) / 100}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          const val = ((Number.isFinite(raw) ? raw : 0) % 24 + 24) % 24;
                          onUpdateProperty(selectedNode.id, 'clockTime', val);
                        }}
                        className="w-14 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* TimeOfDay */}
                {filterMatch('TimeOfDay') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">TimeOfDay</span>
                    <div className="w-[55%]">
                      <input
                        type="text"
                        value={clockTimeToTimeOfDay(selectedNode.clockTime ?? LIGHTING_DEFAULTS.clockTime)}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'clockTime', timeOfDayToClockTime(e.target.value))
                        }
                        className="w-24 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Brightness */}
                {filterMatch('Brightness') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Brightness</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={selectedNode.brightness ?? LIGHTING_DEFAULTS.brightness}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'brightness', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {([
                  ['Ambient', 'ambientColor', LIGHTING_DEFAULTS.ambientColor],
                  ['OutdoorAmbient', 'outdoorAmbient', LIGHTING_DEFAULTS.outdoorAmbient],
                  ['ColorShift_Top', 'colorShiftTop', LIGHTING_DEFAULTS.colorShiftTop],
                  ['ColorShift_Bottom', 'colorShiftBottom', LIGHTING_DEFAULTS.colorShiftBottom],
                  ['FogColor', 'fogColor', LIGHTING_DEFAULTS.fogColor],
                ] as const).map(([label, key, fallback]) =>
                  filterMatch(label) ? (
                    <div key={label} className="flex items-center h-[28px] hover:bg-[#252526] px-3">
                      <span className="w-[45%] text-[#cccccc] truncate">{label}</span>
                      <div className="w-[55%] flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedNode[key] || fallback}
                          onChange={(e) => onUpdateProperty(selectedNode.id, key, e.target.value)}
                          className="w-6 h-5 rounded cursor-pointer border border-[#444] bg-transparent p-0"
                        />
                        <input
                          type="text"
                          value={selectedNode[key] || fallback}
                          onChange={(e) => onUpdateProperty(selectedNode.id, key, e.target.value)}
                          className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none uppercase"
                        />
                      </div>
                    </div>
                  ) : null
                )}

                {filterMatch('GeographicLatitude') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">GeographicLatitude</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-90"
                        max="90"
                        step="0.1"
                        value={selectedNode.geographicLatitude ?? LIGHTING_DEFAULTS.geographicLatitude}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'geographicLatitude',
                            Math.max(-90, Math.min(90, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('FogStart') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">FogStart</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={selectedNode.fogStart ?? LIGHTING_DEFAULTS.fogStart}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'fogStart', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('FogEnd') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">FogEnd</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={selectedNode.fogEnd ?? LIGHTING_DEFAULTS.fogEnd}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'fogEnd', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('GlobalShadows') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">GlobalShadows</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.globalShadows !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'globalShadows', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('ShadowSoftness') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">ShadowSoftness</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.shadowSoftness ?? LIGHTING_DEFAULTS.shadowSoftness}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'shadowSoftness',
                            Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('ExposureCompensation') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">ExposureCompensation</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={selectedNode.exposureCompensation ?? LIGHTING_DEFAULTS.exposureCompensation}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'exposureCompensation',
                            Math.max(-3, Math.min(3, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('EnvironmentDiffuseScale') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">EnvironmentDiffuseScale</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.environmentDiffuseScale ?? LIGHTING_DEFAULTS.environmentDiffuseScale}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'environmentDiffuseScale',
                            Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('EnvironmentSpecularScale') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">EnvironmentSpecularScale</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.environmentSpecularScale ?? LIGHTING_DEFAULTS.environmentSpecularScale}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'environmentSpecularScale',
                            Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('SkyEnabled') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">SkyEnabled</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.skyEnabled !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'skyEnabled', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('FogEnabled') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">FogEnabled</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.fogEnabled !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'fogEnabled', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('AmbientIntensity') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">AmbientIntensity</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.05"
                        value={selectedNode.ambientIntensity ?? LIGHTING_DEFAULTS.ambientIntensity}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'ambientIntensity', Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('SunAngle') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">SunAngle</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-50"
                        max="50"
                        step="1"
                        value={selectedNode.sunAngle ?? LIGHTING_DEFAULTS.sunAngle}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'sunAngle', Math.max(-50, Math.min(50, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= LIGHT SECTION (PointLight, SpotLight, SurfaceLight) ================= */}
        {isLight && (
          filterMatch('Enabled') ||
          filterMatch('Brightness') ||
          filterMatch('Color') ||
          filterMatch('Range') ||
          filterMatch('Shadows') ||
          filterMatch('Angle') ||
          filterMatch('Face')
        ) && (
          <div>
            <div
              onClick={() => toggleSection('light')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.light ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Light
            </div>

            {expandedSections.light && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {filterMatch('Enabled') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Enabled</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.enabled !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'enabled', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Brightness') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Brightness</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="0.1"
                        value={selectedNode.lightBrightness ?? 1}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'lightBrightness', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Color') && (
                  <div className="flex items-center h-[28px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Color</span>
                    <div className="w-[55%] flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedNode.lightColor || '#ffffff'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'lightColor', e.target.value)}
                        className="w-6 h-5 rounded cursor-pointer border border-[#444] bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={selectedNode.lightColor || '#ffffff'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'lightColor', e.target.value)}
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none uppercase"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Range') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Range</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={selectedNode.range ?? 16}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'range', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Shadows') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Shadows</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={!!selectedNode.shadows}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'shadows', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {(nodeTypeLower === 'spotlight' || nodeTypeLower === 'surfacelight') && filterMatch('Angle') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Angle</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="180"
                        step="1"
                        value={selectedNode.angle ?? 90}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'angle', Math.max(0, Math.min(180, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {(nodeTypeLower === 'spotlight' || nodeTypeLower === 'surfacelight') && filterMatch('Face') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Face</span>
                    <div className="w-[55%]">
                      <select
                        value={selectedNode.face || 'Front'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'face', e.target.value)}
                        className="w-full bg-[#181818] text-[#cccccc] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11.5px] outline-none cursor-pointer"
                      >
                        {FACES_LIST.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= SKY SECTION ================= */}
        {isSky && (
          filterMatch('CelestialBodiesShown') ||
          filterMatch('SunAngularSize') ||
          filterMatch('MoonAngularSize') ||
          filterMatch('StarCount') ||
          filterMatch('SkyboxBk') ||
          filterMatch('SkyboxDn') ||
          filterMatch('SkyboxFt') ||
          filterMatch('SkyboxLf') ||
          filterMatch('SkyboxRt') ||
          filterMatch('SkyboxUp')
        ) && (
          <div>
            <div
              onClick={() => toggleSection('sky')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.sky ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Sky
            </div>

            {expandedSections.sky && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {filterMatch('CelestialBodiesShown') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">CelestialBodiesShown</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.celestialBodiesShown !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'celestialBodiesShown', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('SunAngularSize') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">SunAngularSize</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={selectedNode.sunAngularSize ?? 21}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'sunAngularSize', Math.max(0, Math.min(60, parseFloat(e.target.value) || 21)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('MoonAngularSize') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">MoonAngularSize</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={selectedNode.moonAngularSize ?? 11}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'moonAngularSize', Math.max(0, Math.min(60, parseFloat(e.target.value) || 11)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('StarCount') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">StarCount</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="100"
                        value={selectedNode.starCount ?? 3000}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'starCount', Math.max(0, Math.min(10000, parseFloat(e.target.value) || 0)))
                        }
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {(['SkyboxBk', 'SkyboxDn', 'SkyboxFt', 'SkyboxLf', 'SkyboxRt', 'SkyboxUp'] as const).map((prop) => {
                  const key = (prop.charAt(0).toLowerCase() + prop.slice(1)) as keyof TreeNodeData;
                  return filterMatch(prop) ? (
                    <div key={prop} className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                      <span className="w-[45%] text-[#cccccc] truncate">{prop}</span>
                      <div className="w-[55%]">
                        <input
                          type="text"
                          placeholder="Image URL..."
                          value={(selectedNode[key] as string) || ''}
                          onChange={(e) => onUpdateProperty(selectedNode.id, key, e.target.value)}
                          className="w-full bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11px] text-[#cccccc] outline-none"
                        />
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= ATMOSPHERE SECTION ================= */}
        {isAtmosphere && (
          filterMatch('Density') ||
          filterMatch('Offset') ||
          filterMatch('Decay') ||
          filterMatch('Glare') ||
          filterMatch('Haze')
        ) && (
          <div>
            <div
              onClick={() => toggleSection('atmosphere')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.atmosphere ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Atmosphere
            </div>

            {expandedSections.atmosphere && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {filterMatch('Density') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Density</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedNode.density ?? 0.395}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'density', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Offset') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Offset</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedNode.offset ?? 0.25}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'offset', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Decay') && (
                  <div className="flex items-center h-[28px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Decay</span>
                    <div className="w-[55%] flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedNode.decay || '#6a5b4f'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'decay', e.target.value)}
                        className="w-6 h-5 rounded cursor-pointer border border-[#444] bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={selectedNode.decay || '#6a5b4f'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'decay', e.target.value)}
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none uppercase"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Glare') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Glare</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.glare ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'glare', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {filterMatch('Haze') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Haze</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={selectedNode.haze ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'haze', Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= EFFECT SECTION (ColorCorrection, Bloom, SunRays, Blur, DepthOfField) ================= */}
        {isEffect && (
          <div>
            <div
              onClick={() => toggleSection('effect')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.effect ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Effect
            </div>

            {expandedSections.effect && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {filterMatch('Enabled') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Enabled</span>
                    <div className="w-[55%] flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedNode.enabled !== false}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'enabled', e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'colorcorrectioneffect' && filterMatch('Brightness') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Brightness</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={selectedNode.brightness ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'brightness', Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'colorcorrectioneffect' && filterMatch('Contrast') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Contrast</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={selectedNode.contrast ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'contrast', Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'colorcorrectioneffect' && filterMatch('Saturation') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Saturation</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={selectedNode.saturation ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'saturation', Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'colorcorrectioneffect' && filterMatch('TintColor') && (
                  <div className="flex items-center h-[28px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">TintColor</span>
                    <div className="w-[55%] flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedNode.tintColor || '#ffffff'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'tintColor', e.target.value)}
                        className="w-6 h-5 rounded cursor-pointer border border-[#444] bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={selectedNode.tintColor || '#ffffff'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'tintColor', e.target.value)}
                        className="w-20 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1 py-0.5 rounded text-[11px] font-mono text-[#cccccc] outline-none uppercase"
                      />
                    </div>
                  </div>
                )}

                {(nodeTypeLower === 'bloomeffect' || nodeTypeLower === 'sunrayseffect') && filterMatch('Intensity') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Intensity</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.05"
                        value={selectedNode.intensity ?? (nodeTypeLower === 'bloomeffect' ? 1 : 0.25)}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'intensity', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'bloomeffect' && filterMatch('Threshold') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Threshold</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="4"
                        step="0.1"
                        value={selectedNode.threshold ?? 2}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'threshold', Math.max(0, Math.min(4, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {(nodeTypeLower === 'bloomeffect' || nodeTypeLower === 'blureffect') && filterMatch('Size') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Size</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="56"
                        step="1"
                        value={selectedNode.effectSize ?? 24}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'effectSize', Math.max(0, Math.min(56, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {nodeTypeLower === 'sunrayseffect' && filterMatch('Spread') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Spread</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.spread ?? 0.1}
                        onChange={(e) =>
                          onUpdateProperty(selectedNode.id, 'spread', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= SCRIPT SECTION ================= */}
        {isScript && filterMatch('Disabled') && (
          <div>
            <div
              onClick={() => toggleSection('data')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.data ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Script
            </div>

            {expandedSections.data && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                  <span className="w-[45%] text-[#cccccc] truncate">Disabled</span>
                  <div className="w-[55%] flex items-center">
                    <input
                      type="checkbox"
                      checked={!!selectedNode.disabled}
                      onChange={(e) => onUpdateProperty(selectedNode.id, 'disabled', e.target.checked)}
                      className="w-4 h-4 rounded-sm accent-[#0078d7] cursor-pointer bg-[#2d2d2d] border-[#444444]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= DECAL / TEXTURE SECTION ================= */}
        {isDecalOrTexture && (
          <div>
            <div
              onClick={() => toggleSection('texture')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.texture ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              {isTexture ? 'Texture' : 'Decal'}
            </div>

            {expandedSections.texture && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {/* Texture / Asset ID / URL */}
                {filterMatch('Texture') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate" title="Supports Roblox ID, rbxassetid://, catalog link, or image URL">Texture</span>
                    <div className="w-[55%] relative flex items-center">
                      <input
                        type="text"
                        title="Supports numeric Roblox ID (e.g. 144075659), rbxassetid://<id>, Roblox catalog link, or direct image URL"
                        placeholder="ID, rbxassetid:// or URL"
                        value={selectedNode.texture || ''}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'texture', e.target.value)}
                        className="w-full bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] text-[#cccccc] outline-none font-mono pr-5"
                      />
                      {selectedNode.texture && (
                        <button
                          type="button"
                          onClick={() => onUpdateProperty(selectedNode.id, 'texture', '')}
                          className="absolute right-1 text-[#666] hover:text-[#bbb] p-0.5"
                          title="Clear texture"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Face */}
                {filterMatch('Face') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Face</span>
                    <div className="w-[55%]">
                      <select
                        value={selectedNode.face || 'Front'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'face', e.target.value)}
                        className="w-full bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] text-[#cccccc] outline-none"
                      >
                        {FACES_LIST.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Transparency */}
                {filterMatch('Transparency') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Transparency</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedNode.transparency ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'transparency',
                            Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Color3 */}
                {filterMatch('Color3') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">Color3</span>
                    <div className="w-[55%] flex items-center space-x-2">
                      <input
                        type="color"
                        value={selectedNode.color || '#ffffff'}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'color', e.target.value)}
                        className="w-5 h-5 rounded border border-[#3e3e42] bg-transparent cursor-pointer p-0"
                      />
                      <span className="text-[11.5px] font-mono text-[#8a8a8a]">
                        {selectedNode.color || '#ffffff'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Texture-only properties: StudsPerTileU, StudsPerTileV, OffsetStudsU, OffsetStudsV */}
                {isTexture && filterMatch('StudsPerTileU') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">StudsPerTileU</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={selectedNode.studsPerTileU ?? 2}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'studsPerTileU',
                            Math.max(0.01, parseFloat(e.target.value) || 2)
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {isTexture && filterMatch('StudsPerTileV') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">StudsPerTileV</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={selectedNode.studsPerTileV ?? 2}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'studsPerTileV',
                            Math.max(0.01, parseFloat(e.target.value) || 2)
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {isTexture && filterMatch('OffsetStudsU') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">OffsetStudsU</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        step="0.1"
                        value={selectedNode.offsetStudsU ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'offsetStudsU',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {isTexture && filterMatch('OffsetStudsV') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate">OffsetStudsV</span>
                    <div className="w-[55%]">
                      <input
                        type="number"
                        step="0.1"
                        value={selectedNode.offsetStudsV ?? 0}
                        onChange={(e) =>
                          onUpdateProperty(
                            selectedNode.id,
                            'offsetStudsV',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-16 bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= DATA / IDENTITY SECTION ================= */}
        {(filterMatch('Name') || filterMatch('ClassName') || filterMatch('Parent')) && (
          <div>
            <div
              onClick={() => toggleSection('data')}
              className="flex items-center h-[24px] px-2 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer text-[#e0e0e0] font-semibold text-[11.5px] border-b border-[#333333]"
            >
              <span className="mr-1 text-[#888888]">
                {expandedSections.data ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              Data
            </div>

            {expandedSections.data && (
              <div className="divide-y divide-[#2d2d2d] bg-[#1e1e1e]">
                {/* Name */}
                {filterMatch('Name') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate font-medium">Name</span>
                    <div className="w-[55%]">
                      <input
                        type="text"
                        value={selectedNode.name}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'name', e.target.value)}
                        className="w-full bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] text-[#cccccc] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* ClassName */}
                {filterMatch('ClassName') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#8a8a8a] truncate">ClassName</span>
                    <span className="w-[55%] text-[#8a8a8a] text-[11.5px] font-mono">{getClassName()}</span>
                  </div>
                )}

                {/* Parent */}
                {filterMatch('Parent') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#8a8a8a] truncate">Parent</span>
                    <span className="w-[55%] text-[#8a8a8a] text-[11.5px] truncate">{parentName}</span>
                  </div>
                )}

                {/* PrimaryPart for Model */}
                {selectedNode.type === 'model' && filterMatch('PrimaryPart') && (
                  <div className="flex items-center h-[26px] hover:bg-[#252526] px-3">
                    <span className="w-[45%] text-[#cccccc] truncate font-medium">PrimaryPart</span>
                    <div className="w-[55%]">
                      <select
                        value={selectedNode.primaryPartId || ''}
                        onChange={(e) => onUpdateProperty(selectedNode.id, 'primaryPartId', e.target.value || undefined)}
                        className="w-full bg-[#181818] border border-transparent hover:border-[#3e3e42] focus:border-[#0078d7] px-1.5 py-0.5 rounded text-[11.5px] text-[#cccccc] outline-none"
                      >
                        <option value="">None</option>
                        {selectedNode.children
                          .filter((c) => c.type === 'part' || c.type === 'object')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}