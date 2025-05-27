
export interface NodeData {
  id: string;
  title: string;
  description: string;
  parentId: string | null;
  childIds: string[];
  // x and y coordinates are for canvas layout, optional for now
  x?: number; 
  y?: number;
}

export interface NodesObject {
  [nodeId: string]: NodeData;
}

export interface MindmapData {
  nodes: NodesObject;
  rootNodeIds: string[]; // Order of root nodes
}

export interface Mindmap {
  id: string;
  name: string;
  category?: string; // e.g., Physics, History
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
}
