
export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  imageUrl?: string; // New: For displaying an image
  customBackgroundColor?: string; // New: For custom node background
  parentId: string | null;
  childIds: string[];
  x: number; // X coordinate on the canvas
  y: number; // Y coordinate on the canvas
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
  imageUrl?: string;
  customBackgroundColor?: string;
}

