
// PaletteColorKey is for predefined theme colors that can be chosen.
export type PaletteColorKey =
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5';

export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  parentId: string | null;
  childIds: string[];
  x: number;
  y: number;
  customBorderColor?: PaletteColorKey; // Added for custom border color
  // No customBackgroundColor or imageUrl in v0.0.5
}

export interface NodesObject {
  [nodeId: string]: NodeData;
}

export interface MindmapData {
  nodes: NodesObject;
  rootNodeIds: string[];
}

export interface Mindmap {
  id: string;
  name: string;
  category?: string;
  data: MindmapData;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

// For forms
export interface CreateMindmapInput {
  name: string;
  category?: string;
}

export interface EditNodeInput {
  title: string;
  description: string;
  emoji?: string;
  customBorderColor?: PaletteColorKey | 'no-custom-color'; // Added for custom border color selection
  // No customBackgroundColor or imageUrl in v0.0.5
}
