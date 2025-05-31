
// No customBackgroundColor in NodeData for v0.0.5
// No imageUrl in NodeData for v0.0.5

export type NodeSize = 'mini' | 'standard' | 'massive';

export interface NodeData {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  parentId: string | null;
  childIds: string[];
  x: number;
  y: number;
  width?: number; // Actual rendered width, driven by size
  height?: number; // Actual rendered height, driven by size and content
  size?: NodeSize; // New property for fixed sizing
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
  // No customBackgroundColor or imageUrl in v0.0.5 EditNodeInput
  // Size will be handled separately or as part of a more comprehensive update
}
