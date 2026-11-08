import guiPropertiesData from './guiProperties.json';
import worldConfigData from './worldConfig.json';

export interface PropertyDescriptor {
  label: string;
  key: string;
  type: 'udim2' | 'vector2' | 'vector3' | 'number' | 'select' | 'boolean' | 'color' | 'range' | 'text' | 'canvasSize' | 'partSelector' | 'udim';
  default?: any;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  onlyFor?: string[];
  placeholder?: string;
}

export interface GuiPropertySection {
  section: string;
  title: string;
  appliesTo: string[];
  properties: PropertyDescriptor[];
}

export interface WorldObjectConfig {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: string;
  anchored?: boolean;
  canCollide?: boolean;
  texture?: {
    name?: string;
    texture: string;
    face?: string;
    studsPerTileU?: number;
    studsPerTileV?: number;
    transparency?: number;
    color?: string;
  };
  decal?: {
    name?: string;
    texture: string;
    face?: string;
    transparency?: number;
    color?: string;
  };
}

export interface WorldConfig {
  baseplate: WorldObjectConfig;
  spawnLocation: WorldObjectConfig;
  defaultPart: {
    name?: string;
    size: [number, number, number];
    position: [number, number, number];
    rotation?: [number, number, number];
    color?: string;
    material?: string;
    anchored?: boolean;
    canCollide?: boolean;
  };
}

export const worldConfig: WorldConfig = worldConfigData as WorldConfig;

export function getWorldDefaultPosition(node: { name?: string; type?: string; position?: [number, number, number] }): [number, number, number] {
  if (node.position) return node.position;
  const name = (node.name || '').toLowerCase();
  const type = (node.type || '').toLowerCase();
  if (name === 'baseplate') return [...worldConfig.baseplate.position];
  if (name === 'spawnlocation' || type === 'spawnlocation') return [...worldConfig.spawnLocation.position];
  return [...worldConfig.defaultPart.position];
}

export function getWorldDefaultSize(node: { name?: string; type?: string; size?: [number, number, number] }): [number, number, number] {
  if (node.size) return node.size;
  const name = (node.name || '').toLowerCase();
  const type = (node.type || '').toLowerCase();
  if (name === 'baseplate') return [...worldConfig.baseplate.size];
  if (name === 'spawnlocation' || type === 'spawnlocation') return [...worldConfig.spawnLocation.size];
  return [...worldConfig.defaultPart.size];
}

export function getWorldDefaultColor(node: { name?: string; type?: string; color?: string }): string {
  if (node.color) return node.color;
  const name = (node.name || '').toLowerCase();
  const type = (node.type || '').toLowerCase();
  if (name === 'baseplate') return worldConfig.baseplate.color || '#5B5B5B';
  if (name === 'spawnlocation' || type === 'spawnlocation') return worldConfig.spawnLocation.color || '#e8e8e8';
  return worldConfig.defaultPart.color || '#a3a2a5';
}

export const guiPropertySections: GuiPropertySection[] = guiPropertiesData as GuiPropertySection[];
export default guiPropertySections;
