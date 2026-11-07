export type LogType = 'print' | 'warn' | 'error' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
}

export interface LuaSyntaxError {
  line: number;
  message: string;
}

export type LuaDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface LuaDiagnostic {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: LuaDiagnosticSeverity;
}

export interface RigidBodyState {
  id: string;
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  lastPos: [number, number, number];
  asleep: boolean;
  sleepTimer: number;
  restContacts?: string[];
  restSig?: number[] | null;
  lastSeen?: number;
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
  // GUI Object Properties
  guiPosition?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  guiSize?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  anchorPoint?: [number, number];
  guiRotation?: number;
  sizeConstraint?: 'RelativeXY' | 'RelativeXX' | 'RelativeYY' | string;
  automaticSize?: 'None' | 'X' | 'Y' | 'XY' | string;
  selectable?: boolean;
  backgroundColor?: string;
  backgroundTransparency?: number;
  borderColor?: string;
  borderSizePixel?: number;
  borderMode?: 'Outline' | 'Middle' | 'Inset' | string;
  autoLocalize?: boolean;
  visible?: boolean;
  active?: boolean;
  clipsDescendants?: boolean;
  layoutOrder?: number;
  // Text Properties (TextLabel, TextButton, TextBox)
  text?: string;
  textColor?: string;
  textTransparency?: number;
  textStrokeColor?: string;
  textStrokeTransparency?: number;
  textSize?: number;
  textScaled?: boolean;
  textWrapped?: boolean;
  font?: string;
  richText?: boolean;
  textTruncate?: 'None' | 'AtEnd' | 'SplitWord' | string;
  lineHeight?: number;
  maxVisibleGraphemes?: number;
  textXAlignment?: 'Left' | 'Center' | 'Right' | string;
  textYAlignment?: 'Top' | 'Center' | 'Bottom' | string;
  // Image Properties (ImageLabel, ImageButton)
  image?: string;
  imageColor?: string;
  imageTransparency?: number;
  scaleType?: 'Stretch' | 'Slice' | 'Tile' | 'Fit' | 'Crop' | string;
  sliceScale?: number;
  sliceCenter?: [number, number, number, number];
  tileSize?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  imageRectOffset?: [number, number];
  imageRectSize?: [number, number];
  resampleMode?: 'Default' | 'Pixelated' | string;
  // Button Properties (TextButton, ImageButton)
  autoButtonColor?: boolean;
  selected?: boolean;
  modal?: boolean;
  // TextBox Properties
  placeholderText?: string;
  placeholderColor?: string;
  clearTextOnFocus?: boolean;
  multiLine?: boolean;
  textEditable?: boolean;
  showNativeInput?: boolean;
  cursorPosition?: number;
  // ScrollingFrame Properties
  canvasPosition?: [number, number];
  scrollingCanvasSize?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  scrollingDirection?: 'X' | 'Y' | 'XY' | string;
  scrollBarThickness?: number;
  scrollBarImageColor?: string;
  scrollBarImageTransparency?: number;
  verticalScrollBarInset?: 'None' | 'ScrollBar' | 'Always' | string;
  verticalScrollBarPosition?: 'Right' | 'Left' | string;
  horizontalScrollBarInset?: 'None' | 'ScrollBar' | 'Always' | string;
  elasticBehavior?: 'WhenScrollable' | 'Always' | 'Never' | string;
  scrollingEnabled?: boolean;
  automaticCanvasSize?: 'None' | 'X' | 'Y' | 'XY' | string;
  // ScreenGui Properties
  ignoreGuiInset?: boolean;
  resetOnSpawn?: boolean;
  displayOrder?: number;
  zIndexBehavior?: 'Global' | 'Sibling' | string;
  clipToDeviceSafeArea?: boolean;
  // SurfaceGui & BillboardGui Properties
  canvasSize?: [number, number];
  studsOffset?: [number, number, number];
  alwaysOnTop?: boolean;
  maxDistance?: number;
  adorneeId?: string;
  lightInfluence?: number;
  pixelsPerStud?: number;
  sizingMode?: 'FixedSize' | 'PixelsPerStud' | string;
  sizeOffset?: [number, number];
  studsOffsetWorldSpace?: [number, number, number];
  extentsOffset?: [number, number, number];
  extentsOffsetWorldSpace?: [number, number, number];
  distanceLowerLimit?: number;
  distanceUpperLimit?: number;
  // UI Modifier Properties
  cornerRadius?: { scale: number; offset: number };
  strokeThickness?: number;
  strokeColor?: string;
  strokeTransparency?: number;
  applyStrokeMode?: 'Contextual' | 'Border' | string;
  lineJoinMode?: 'Round' | 'Bevel' | 'Miter' | string;
  paddingTop?: { scale: number; offset: number };
  paddingBottom?: { scale: number; offset: number };
  paddingLeft?: { scale: number; offset: number };
  paddingRight?: { scale: number; offset: number };
  fillDirection?: 'Horizontal' | 'Vertical' | string;
  horizontalAlignment?: 'Left' | 'Center' | 'Right' | string;
  verticalAlignment?: 'Top' | 'Center' | 'Bottom' | string;
  layoutPadding?: { scale: number; offset: number };
  sortOrder?: 'LayoutOrder' | 'Name' | string;
  cellSize?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  cellPadding?: { xScale: number; xOffset: number; yScale: number; yOffset: number };
  startCorner?: 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight' | string;
  fillDirectionMaxCells?: number;
  itemHorizontalAlignment?: 'Left' | 'Center' | 'Right' | string;
  wraps?: boolean;
  aspectRatio?: number;
  aspectType?: 'FitWithinMaxSize' | 'ScaleWithParentSize' | string;
  dominantAxis?: 'Width' | 'Height' | string;
  minSize?: [number, number];
  maxSize?: [number, number];
  minTextSize?: number;
  maxTextSize?: number;
  uiScale?: number;
  gradientColor?: string;
  gradientTransparency?: number;
  gradientRotation?: number;
  gradientOffset?: [number, number];
  animated?: boolean;
  circular?: boolean;
  easingDirection?: string;
  easingStyle?: string;
  tweenTime?: number;
  flexMode?: 'None' | 'Grow' | 'Shrink' | 'Fill' | 'Custom' | string;
  itemLineAlignment?: 'Automatic' | 'Start' | 'Center' | 'End' | 'Stretch' | string;
  growRatio?: number;
  shrinkRatio?: number;
};
