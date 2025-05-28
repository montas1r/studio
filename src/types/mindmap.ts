
// This version is simplified, before PaletteColorKey, customBackgroundColor, or imageUrl.
// It has a basic emoji field.

export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string; 
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
}
