
export enum NodeType {
  PERSON = 'PERSON',
  ORGANIZATION = 'ORGANIZATION',
  EVENT = 'EVENT',
  LOCATION = 'LOCATION',
  GENERIC = 'GENERIC',
  IMAGE = 'IMAGE',
  POSTIT = 'POSTIT'
}

export type DetailItem = {
  id: string;
  icon: string; // 'calendar', 'id', 'briefcase', 'map', 'alert', etc.
  value: string;
};

export interface NodeData {
  id: string;
  x: number;
  y: number;
  label: string;
  type: NodeType;
  customImage?: string; // Base64 or URL
  width?: number; // Custom width (used by IMAGE and POSTIT nodes)
  height?: number; // Custom height (used by IMAGE and POSTIT nodes)
  noteText?: string; // Multi-line observation text for POSTIT nodes
  noteColor?: string; // Background color for POSTIT nodes
  mainIcon?: string; // Override standard type icon name
  details?: DetailItem[];
  highlightColor?: string; // Hex color for aura
  highlightSize?: number; // Size of aura in pixels
}

export type EdgeDirection = 'uni' | 'bi' | 'none';
export type EdgeStyle = 'solid' | 'dashed';
export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeData {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  sourceHandle?: HandleSide; // Side where connection starts (top, bottom, left, right)
  targetHandle?: HandleSide; // Side where connection ends (top, bottom, left, right)
  label?: string;
  color?: string;
  direction?: EdgeDirection;
  style?: EdgeStyle; // New: Line style
  details?: DetailItem[]; // New: Details for edges
  curvatureOffset?: number; // New: Manual curvature adjustment
}

// --- SHAPES ---
export type ShapeType = 'rectangle' | 'circle' | 'line';

export interface ShapeData {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number; // For line: endX - x
  height: number; // For line: endY - y
  color: string;
  label?: string;
}

export interface GraphState {
  nodes: NodeData[];
  edges: EdgeData[];
  shapes?: ShapeData[]; // Optional for backward compatibility
}

// Updated: Supports multi-node dragging by tracking start pos + initial node positions
export type DragState = {
  isDragging: boolean;
  startX: number; // Mouse Start X (Canvas Coords)
  startY: number; // Mouse Start Y (Canvas Coords)
  initialPositions: Record<string, { x: number; y: number }>; // Snapshot of selected nodes
} | null;

export type SelectionBoxState = {
  startX: number; // Screen Coords
  startY: number; // Screen Coords
  currentX: number; // Screen Coords
  currentY: number; // Screen Coords
  isVisible: boolean;
} | null;

export type ConnectionState = {
  isConnecting: boolean;
  sourceNodeId: string | null;
  sourceHandle?: HandleSide;
  mousePos: { x: number; y: number } | null;
} | null;
