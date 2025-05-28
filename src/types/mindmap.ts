
export type PaletteColorKey = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5';

export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  customBackgroundColor?: PaletteColorKey; // Updated to use PaletteColorKey
  // imageUrl?: string; // Removed for this revert
  parentId: string | null;
  childIds: string[];
  x: number;
  y: number;
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
  customBackgroundColor?: PaletteColorKey | ''; // Allow empty string to clear
  // imageUrl?: string; // Removed for this revert
}
