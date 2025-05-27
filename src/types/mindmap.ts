
export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string;
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
  // We might need to store canvas viewport state later (zoom, pan)
  // canvasViewport?: { x: number, y: number, zoom: number };
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
