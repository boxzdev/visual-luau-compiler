import guiPropertiesData from './guiProperties.json';

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

export const guiPropertySections: GuiPropertySection[] = guiPropertiesData as GuiPropertySection[];
export default guiPropertySections;
