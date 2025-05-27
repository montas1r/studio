
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Constants for initial node placement
const INITIAL_ROOT_X = 0; // Changed from 50 to 0
const INITIAL_ROOT_Y = 0; // Changed from 50 to 0
const ROOT_X_SPACING = 350; 
const CHILD_X_OFFSET = 0; 
const CHILD_Y_OFFSET = 150; 
const NODE_WIDTH = 300; 

export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    const migratedMindmaps = loadedMindmaps.map(m => {
      let needsUpdate = false;
      const newNodes = { ...m.data.nodes };
      let currentRootX = INITIAL_ROOT_X; // Start roots from the new initial X
      
      m.data.rootNodeIds.forEach((rootId, index) => {
        if (newNodes[rootId] && (newNodes[rootId].x === undefined || newNodes[rootId].y === undefined)) {
          newNodes[rootId] = {
            ...newNodes[rootId],
            x: INITIAL_ROOT_X + index * ROOT_X_SPACING, // Position based on new initial
            y: INITIAL_ROOT_Y
          };
          needsUpdate = true;
        }
        // Update currentRootX for potential non-root nodes that might become roots if logic changes
        if (newNodes[rootId] && newNodes[rootId].x !== undefined) {
             currentRootX = Math.max(currentRootX, newNodes[rootId].x + ROOT_X_SPACING);
        } else {
            currentRootX += ROOT_X_SPACING;
        }
      });

      Object.keys(newNodes).forEach(nodeId => {
        const node = newNodes[nodeId];
        if (node.parentId && newNodes[node.parentId] && (node.x === undefined || node.y === undefined)) {
            const parentNode = newNodes[node.parentId];
            const siblingIndex = parentNode.childIds.indexOf(nodeId);
            newNodes[nodeId] = {
                ...node,
                x: parentNode.x + CHILD_X_OFFSET + (siblingIndex - (parentNode.childIds.length -1) / 2) * (NODE_WIDTH / 3 + 10), // Spread children less aggressively
                y: parentNode.y + CHILD_Y_OFFSET,
            };
            needsUpdate = true;
        } else if (!node.parentId && (node.x === undefined || node.y === undefined)) {
            // This case should ideally be covered by the rootNodeIds loop
             newNodes[nodeId] = {
                ...newNodes[nodeId],
                x: currentRootX, // Use the tracked currentRootX
                y: INITIAL_ROOT_Y
            };
            currentRootX += ROOT_X_SPACING;
            needsUpdate = true;
        }
      });
      if(needsUpdate) {
        return { ...m, data: { ...m.data, nodes: newNodes } };
      }
      return m;
    });

    setMindmaps(migratedMindmaps);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      saveMindmapsToStorage(mindmaps);
    }
  }, [mindmaps, isLoading]);

  const createMindmap = useCallback((input: CreateMindmapInput): Mindmap => {
    const newMindmap: Mindmap = {
      id: uuidv4(),
      name: input.name,
      category: input.category,
      data: {
        nodes: {},
        rootNodeIds: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMindmaps(prev => [...prev, newMindmap]);
    return newMindmap;
  }, []);

  const getMindmapById = useCallback((id: string): Mindmap | undefined => {
    return mindmaps.find(m => m.id === id);
  }, [mindmaps]);

  const updateMindmap = useCallback((id: string, updatedData: Partial<Omit<Mindmap, 'id' | 'createdAt'>>) => {
    setMindmaps(prev =>
      prev.map(m =>
        m.id === id ? { ...m, ...updatedData, updatedAt: new Date().toISOString() } : m
      )
    );
  }, []);
  
  const deleteMindmap = useCallback((id: string) => {
    setMindmaps(prev => prev.filter(m => m.id !== id));
  }, []);

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: { title: string; description: string; emoji?: string }) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined; // Return undefined if mindmap not found

    const newNodeId = uuidv4();
    let x = INITIAL_ROOT_X;
    let y = INITIAL_ROOT_Y;

    if (parentId) {
      const parentNode = mindmap.data.nodes[parentId];
      if (parentNode) {
        const siblingCount = parentNode.childIds.length;
        x = parentNode.x + CHILD_X_OFFSET + (siblingCount - (parentNode.childIds.length / 2)) * 20; 
        y = parentNode.y + CHILD_Y_OFFSET;
      }
    } else {
      // New root node: position based on new initial values and existing root nodes
      x = INITIAL_ROOT_X + mindmap.data.rootNodeIds.length * ROOT_X_SPACING;
      y = INITIAL_ROOT_Y;
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      parentId,
      childIds: [],
      x,
      y,
    };

    const updatedNodes = { ...mindmap.data.nodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...mindmap.data.rootNodeIds];

    if (parentId) {
      const parentNode = updatedNodes[parentId];
      if (parentNode) {
        updatedNodes[parentId] = { ...parentNode, childIds: [...parentNode.childIds, newNodeId] };
      }
    } else {
      updatedRootNodeIds.push(newNodeId);
    }
    
    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode; // Return the created node
  }, [getMindmapById, updateMindmap]);

  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNode = { ...mindmap.data.nodes[nodeId], ...updates };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const updateNodePosition = useCallback((mindmapId: string, nodeId: string, x: number, y: number) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNode = { ...mindmap.data.nodes[nodeId], x, y };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);


  const deleteNodeRecursive = (nodes: NodesObject, nodeId: string): NodesObject => {
    const nodeToDelete = nodes[nodeId];
    if (!nodeToDelete) return nodes;

    let newNodes = { ...nodes };
    // Iteratively delete children first to avoid issues if childIds array is modified during recursion
    const childrenToDelete = [...nodeToDelete.childIds];
    childrenToDelete.forEach(childId => {
      newNodes = deleteNodeRecursive(newNodes, childId);
    });
    
    // Now delete the node itself
    delete newNodes[nodeId];

    // Update parent's childIds list
    if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
      newNodes[nodeToDelete.parentId] = {
        ...newNodes[nodeToDelete.parentId],
        childIds: newNodes[nodeToDelete.parentId].childIds.filter(id => id !== nodeId),
      };
    }
        
    return newNodes;
  };

  const deleteNode = useCallback((mindmapId: string, nodeId: string) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const nodeToDelete = mindmap.data.nodes[nodeId];
    const newNodes = deleteNodeRecursive(mindmap.data.nodes, nodeId);
    
    let newRootNodeIds = mindmap.data.rootNodeIds;
    if (!nodeToDelete.parentId) { // If it was a root node
      newRootNodeIds = mindmap.data.rootNodeIds.filter(id => id !== nodeId);
    }

    updateMindmap(mindmapId, { data: { nodes: newNodes, rootNodeIds: newRootNodeIds } });
  }, [getMindmapById, updateMindmap]);


  return {
    mindmaps,
    isLoading,
    createMindmap,
    getMindmapById,
    updateMindmap,
    deleteMindmap,
    addNode,
    updateNode,
    updateNodePosition,
    deleteNode,
  };
}
