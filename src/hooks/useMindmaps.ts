
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Module-level constants for node sizing
const NODE_CARD_WIDTH = 300; // Used in MindmapEditor for clamping as well

// APPROX_NODE_MIN_HEIGHT_NO_DESC is defined in MindmapEditor, useMindmaps should be robust enough not to need it directly
// for placement, or receive it as a param if needed.

export function useMindmaps() {
  // Hook-level constants for initial placement logic - ensure these are reasonable for a 1200x800 canvas
  const INITIAL_ROOT_X = 50; // Start a bit into the canvas
  const INITIAL_ROOT_Y = 50;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; 
  const CHILD_Y_OFFSET = 120; // Reduced a bit for potentially denser layout

  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Function to approximate node height, simpler version for hook logic
  const getApproxNodeHeight = (node: Partial<NodeData>): number => {
    const APPROX_NODE_MIN_HEIGHT = 70;
    const APPROX_LINE_HEIGHT = 18;
    if (!node.description) return APPROX_NODE_MIN_HEIGHT;
    const linesFromDesc = Math.ceil((node.description.length / (NODE_CARD_WIDTH / 7))) + (node.description.split('\n').length -1);
    return Math.max(APPROX_NODE_MIN_HEIGHT, APPROX_NODE_MIN_HEIGHT - 20 + (Math.max(1, linesFromDesc) * APPROX_LINE_HEIGHT) + 20);
  };


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    // No complex migration needed here for x,y as previous versions already handled it.
    // Just ensure any new nodes get valid default positions via addNode.
    setMindmaps(loadedMindmaps.map(m => ({
        ...m,
        updatedAt: m.updatedAt || new Date().toISOString(), // Ensure updatedAt exists
        data: {
            ...m.data,
            nodes: m.data.nodes || {},
            rootNodeIds: Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : []
        }
    })));
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

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput, initialX?: number, initialY?: number) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x = initialX;
    let y = initialY;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];

    if (x === undefined || y === undefined) { 
        if (parentId) {
            const parentNode = currentNodes[parentId];
            if (parentNode) {
                const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
                const siblingCount = parentChildIds.length;
                const parentNodeHeight = getApproxNodeHeight(parentNode);
                
                x = (parentNode.x ?? INITIAL_ROOT_X);
                y = (parentNode.y ?? INITIAL_ROOT_Y) + parentNodeHeight + CHILD_Y_OFFSET;

                if (siblingCount > 0) {
                    const lastSibling = currentNodes[parentChildIds[siblingCount - 1]];
                    if (lastSibling) {
                        x = (lastSibling.x ?? parentNode.x ?? INITIAL_ROOT_X) + NODE_CARD_WIDTH + 30; // Place to the right of last sibling
                        y = (lastSibling.y ?? y); // Align Y with last sibling
                    }
                }
            } else { // ParentId provided but parent not found, treat as new root.
                let maxRootX = -Infinity;
                if(currentRootNodeIds.length > 0) {
                    currentRootNodeIds.forEach(rootId => {
                        const rNode = currentNodes[rootId];
                        if (rNode && rNode.x !== undefined) maxRootX = Math.max(maxRootX, rNode.x);
                    });
                     x = maxRootX + ROOT_X_SPACING;
                } else {
                    x = INITIAL_ROOT_X;
                }
                y = INITIAL_ROOT_Y;
                parentId = null; 
            }
        } else { // No parentId, new root node
            let maxRootX = -Infinity;
            if(currentRootNodeIds.length > 0) {
                currentRootNodeIds.forEach(rootId => {
                    const rNode = currentNodes[rootId];
                    if (rNode && rNode.x !== undefined) maxRootX = Math.max(maxRootX, rNode.x);
                });
                x = maxRootX + ROOT_X_SPACING;
            } else {
                x = INITIAL_ROOT_X;
            }
            y = INITIAL_ROOT_Y;
        }
    }


    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      parentId,
      childIds: [],
      x: x as number, 
      y: y as number,
      customBackgroundColor: nodeDetails.customBackgroundColor || undefined,
    };

    const updatedNodes = { ...currentNodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...currentRootNodeIds];

    if (parentId && updatedNodes[parentId]) {
        const parentNodeFromMap = updatedNodes[parentId];
        updatedNodes[parentId] = { 
            ...parentNodeFromMap, 
            childIds: [...(Array.isArray(parentNodeFromMap.childIds) ? parentNodeFromMap.childIds : []), newNodeId] 
        };
    } else if (!parentId) {
      if (!updatedRootNodeIds.includes(newNodeId)) {
        updatedRootNodeIds.push(newNodeId);
      }
    }

    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap, INITIAL_ROOT_X, INITIAL_ROOT_Y, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNodeData: NodeData = {
      ...mindmap.data.nodes[nodeId],
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      customBackgroundColor: updates.customBackgroundColor || undefined,
      // x and y are updated by updateNodePosition
    };

    const updatedNodes = {
      ...mindmap.data.nodes,
      [nodeId]: updatedNodeData
    };
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
    const childrenToDelete = [...(Array.isArray(nodeToDelete.childIds) ? nodeToDelete.childIds : [])];
    childrenToDelete.forEach(childId => {
      newNodes = deleteNodeRecursive(newNodes, childId);
    });

    delete newNodes[nodeId];

    if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
      const parentNode = newNodes[nodeToDelete.parentId];
      const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
      newNodes[nodeToDelete.parentId] = {
        ...parentNode,
        childIds: parentChildIds.filter(id => id !== nodeId),
      };
    }
    return newNodes;
  };

  const deleteNode = useCallback((mindmapId: string, nodeId: string) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const nodeToDelete = mindmap.data.nodes[nodeId];
    const newNodes = deleteNodeRecursive(mindmap.data.nodes, nodeId);

    let newRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    if (!nodeToDelete.parentId) { 
      newRootNodeIds = newRootNodeIds.filter(id => id !== nodeId);
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
