
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Define fundamental constants at module scope
const NODE_CARD_WIDTH = 300;

export function useMindmaps() {
  // Define layout constants that might depend on NODE_CARD_WIDTH inside the hook
  const INITIAL_ROOT_X = 50; // Provide some initial padding from edge
  const INITIAL_ROOT_Y = 50;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; // Child X relative to parent's center - NODE_CARD_WIDTH / 2 for left align
  const CHILD_Y_OFFSET = 180; // Vertical spacing between parent and child

  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    // Basic migration for nodes that might not have x,y
    const migratedMindmaps = loadedMindmaps.map(m => {
      let needsUpdate = false;
      const newNodes = { ...m.data.nodes };
      let currentRootX = INITIAL_ROOT_X;

      const rootNodeIds = Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : [];

      rootNodeIds.forEach((rootId) => {
        if (newNodes[rootId] && (newNodes[rootId].x === undefined || newNodes[rootId].y === undefined)) {
          newNodes[rootId] = {
            ...newNodes[rootId],
            x: currentRootX,
            y: INITIAL_ROOT_Y
          };
          currentRootX += ROOT_X_SPACING;
          needsUpdate = true;
        } else if (newNodes[rootId] && newNodes[rootId].x !== undefined) {
           currentRootX = Math.max(currentRootX, (newNodes[rootId].x ?? 0) + ROOT_X_SPACING);
        } else {
            // Should not happen if rootNodeIds is correctly populated
            currentRootX += ROOT_X_SPACING;
        }
      });
      
      // Ensure all nodes have x, y. This is a very basic placement if missing.
      Object.keys(newNodes).forEach(nodeId => {
        const node = newNodes[nodeId];
        if (node.x === undefined || node.y === undefined) {
          needsUpdate = true;
          if (node.parentId && newNodes[node.parentId]) {
            const parentNode = newNodes[node.parentId];
            const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
            const siblingIndex = parentChildIds.indexOf(nodeId);
            const numSiblings = parentChildIds.length;
            const spreadWidth = (numSiblings - 1) * (NODE_CARD_WIDTH / 2 + 10);

            newNodes[nodeId] = {
              ...node,
              x: (parentNode.x ?? INITIAL_ROOT_X) + CHILD_X_OFFSET + (siblingIndex * (NODE_CARD_WIDTH + 30)) - (spreadWidth/2),
              y: (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET,
            };
          } else if (!rootNodeIds.includes(nodeId)) { // Orphaned node or new root not yet in rootNodeIds
            newNodes[nodeId] = {
              ...node,
              x: currentRootX,
              y: INITIAL_ROOT_Y,
            };
            currentRootX += ROOT_X_SPACING;
          }
        }
      });


      if(needsUpdate) {
        return { ...m, data: { ...m.data, nodes: newNodes, rootNodeIds } };
      }
      return { ...m, data: { ...m.data, rootNodeIds } }; // Ensure rootNodeIds is always an array
    });
    
    setMindmaps(migratedMindmaps);
    setIsLoading(false);
  }, [CHILD_X_OFFSET, CHILD_Y_OFFSET, INITIAL_ROOT_X, INITIAL_ROOT_Y, ROOT_X_SPACING]);

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

 const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x = INITIAL_ROOT_X;
    let y = INITIAL_ROOT_Y;

    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];

    if (parentId) {
        const parentNode = mindmap.data.nodes[parentId];
        if (parentNode) {
            const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
            const siblingCount = parentChildIds.length; // Number of existing siblings
            const totalChildrenAfterAdd = siblingCount + 1;
            
            // Calculate spread based on the center of the parent
            const groupWidth = (totalChildrenAfterAdd -1) * (NODE_CARD_WIDTH + 30); // Width of the group of children
            const firstChildXOffset = -groupWidth / 2; // Offset for the first child to center the group

            x = (parentNode.x ?? INITIAL_ROOT_X) + (NODE_CARD_WIDTH / 2) + firstChildXOffset + (siblingCount * (NODE_CARD_WIDTH + 30));
            y = (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET;
        }
    } else {
        // New root node
        let maxRootX = -Infinity;
        if (currentRootNodeIds.length > 0) {
            currentRootNodeIds.forEach(rootId => {
                if (mindmap.data.nodes[rootId] && mindmap.data.nodes[rootId].x !== undefined) {
                    maxRootX = Math.max(maxRootX, mindmap.data.nodes[rootId].x ?? -Infinity);
                }
            });
            x = (maxRootX === -Infinity) ? INITIAL_ROOT_X : maxRootX + ROOT_X_SPACING;
        } else {
            x = INITIAL_ROOT_X; // First root node
        }
        y = INITIAL_ROOT_Y;
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      imageUrl: nodeDetails.imageUrl,
      customBackgroundColor: nodeDetails.customBackgroundColor === '' ? undefined : nodeDetails.customBackgroundColor,
      parentId,
      childIds: [],
      x,
      y,
    };

    const updatedNodes = { ...mindmap.data.nodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...currentRootNodeIds];

    if (parentId) {
      const parentNodeFromMap = updatedNodes[parentId];
      if (parentNodeFromMap) {
        updatedNodes[parentId] = { ...parentNodeFromMap, childIds: [...(Array.isArray(parentNodeFromMap.childIds) ? parentNodeFromMap.childIds : []), newNodeId] };
      }
    } else {
      updatedRootNodeIds.push(newNodeId);
    }

    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap, INITIAL_ROOT_X, INITIAL_ROOT_Y, ROOT_X_SPACING, CHILD_Y_OFFSET, CHILD_X_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNodeData: NodeData = {
      ...mindmap.data.nodes[nodeId],
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      imageUrl: updates.imageUrl || undefined,
      customBackgroundColor: updates.customBackgroundColor === '' ? undefined : (updates.customBackgroundColor as PaletteColorKey | undefined),
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
