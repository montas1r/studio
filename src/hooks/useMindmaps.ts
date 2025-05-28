
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Module-level constants for node sizing
const NODE_CARD_WIDTH = 300;

export function useMindmaps() {
  // Hook-level constants for initial placement logic
  const INITIAL_ROOT_X = 0;
  const INITIAL_ROOT_Y = 0;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50; // Uses module-level NODE_CARD_WIDTH
  const CHILD_X_OFFSET = 0; 
  const CHILD_Y_OFFSET = 180;


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    let currentGlobalX = INITIAL_ROOT_X;

    const migratedMindmaps = loadedMindmaps.map(m => {
      let needsUpdate = false;
      const newNodes: NodesObject = { ...m.data.nodes };
      const rootNodeIds = Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : [];
      
      let localCurrentRootX = currentGlobalX;

      rootNodeIds.forEach((rootId) => {
        const node = newNodes[rootId];
        if (node && (node.x === undefined || node.y === undefined)) {
          newNodes[rootId] = {
            ...node,
            x: localCurrentRootX, 
            y: INITIAL_ROOT_Y
          };
          localCurrentRootX += ROOT_X_SPACING;
          needsUpdate = true;
        } else if (node?.x !== undefined) {
           localCurrentRootX = Math.max(localCurrentRootX, node.x + ROOT_X_SPACING);
        }
         // Ensure no old fields from pre-v1.0.1 like imageUrl persist
        if (newNodes[rootId]?.hasOwnProperty('imageUrl')) {
          delete (newNodes[rootId] as any).imageUrl;
          needsUpdate = true;
        }
      });
      
      Object.keys(newNodes).forEach(nodeId => {
        const node = newNodes[nodeId];
        
        if (node.x === undefined || node.y === undefined) {
          needsUpdate = true;
          if (node.parentId && newNodes[node.parentId]) {
            const parentNode = newNodes[node.parentId];
            const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
            const siblingIndex = parentChildIds.indexOf(nodeId);
            
            const calculatedX = (parentNode.x ?? INITIAL_ROOT_X) + CHILD_X_OFFSET + 
                               (siblingIndex >= 0 ? siblingIndex * (NODE_CARD_WIDTH + 30) : 0);
            const calculatedY = (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET;

            newNodes[nodeId] = { ...node, x: calculatedX, y: calculatedY };
          } else if (!rootNodeIds.includes(nodeId)) { 
            newNodes[nodeId] = { ...node, x: localCurrentRootX, y: INITIAL_ROOT_Y + CHILD_Y_OFFSET * 2 };
            localCurrentRootX += ROOT_X_SPACING;
          }
        }
         // Ensure no old fields like imageUrl persist
        if (newNodes[nodeId]?.hasOwnProperty('imageUrl')) {
          delete (newNodes[nodeId] as any).imageUrl;
          needsUpdate = true;
        }
      });
      
      currentGlobalX = Math.max(currentGlobalX, localCurrentRootX);

      const updatedData = { ...m.data, nodes: newNodes, rootNodeIds };
      return { ...m, data: updatedData, updatedAt: (needsUpdate || !m.updatedAt) ? new Date().toISOString() : m.updatedAt };
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

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput, initialX?: number, initialY?: number) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x = initialX;
    let y = initialY;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];

    if (x === undefined || y === undefined) { // Calculate position if not provided
        if (parentId) {
            const parentNode = currentNodes[parentId];
            if (parentNode) {
                const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
                const siblingCount = parentChildIds.length;
                x = (parentNode.x ?? INITIAL_ROOT_X) + CHILD_X_OFFSET + (siblingCount * (NODE_CARD_WIDTH + 30));
                y = (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET;
            } else { 
                let maxRootX = -Infinity;
                currentRootNodeIds.forEach(rootId => {
                    const rNode = currentNodes[rootId];
                    if (rNode && rNode.x !== undefined) maxRootX = Math.max(maxRootX, rNode.x);
                });
                x = currentRootNodeIds.length > 0 ? maxRootX + ROOT_X_SPACING : INITIAL_ROOT_X;
                y = INITIAL_ROOT_Y;
                parentId = null; 
            }
        } else { 
            let maxRootX = -Infinity;
            currentRootNodeIds.forEach(rootId => {
                const rNode = currentNodes[rootId];
                if (rNode && rNode.x !== undefined) maxRootX = Math.max(maxRootX, rNode.x);
            });
            x = currentRootNodeIds.length > 0 ? maxRootX + ROOT_X_SPACING : INITIAL_ROOT_X;
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
      x: x as number, // Assert as number after calculation/provision
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
