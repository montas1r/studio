
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

const NODE_CARD_WIDTH = 300;

export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Define layout constants inside the hook
  const INITIAL_ROOT_X = 0;
  const INITIAL_ROOT_Y = 0;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; // Relative to parent
  const CHILD_Y_OFFSET = 180; // Approx (Node Header + Description + Spacing)

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    let currentRootXGlobal = INITIAL_ROOT_X;

    const migratedMindmaps = loadedMindmaps.map(m => {
      let needsUpdate = false;
      const newNodes: NodesObject = { ...m.data.nodes };
      const rootNodeIds = Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : [];
      let localCurrentRootX = currentRootXGlobal;

      rootNodeIds.forEach((rootId, index) => {
        if (newNodes[rootId] && (newNodes[rootId].x === undefined || newNodes[rootId].y === undefined)) {
          newNodes[rootId] = {
            ...newNodes[rootId],
            x: INITIAL_ROOT_X + index * ROOT_X_SPACING,
            y: INITIAL_ROOT_Y
          };
          needsUpdate = true;
        }
        if(newNodes[rootId]?.x !== undefined) {
           localCurrentRootX = Math.max(localCurrentRootX, newNodes[rootId].x + ROOT_X_SPACING);
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
            newNodes[nodeId] = {
              ...node,
              x: (parentNode.x ?? INITIAL_ROOT_X) + CHILD_X_OFFSET + (siblingIndex >= 0 ? siblingIndex * (NODE_CARD_WIDTH + 30) : 0),
              y: (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET,
            };
          } else if (!rootNodeIds.includes(nodeId)) {
            newNodes[nodeId] = {
              ...node,
              x: localCurrentRootX,
              y: INITIAL_ROOT_Y + CHILD_Y_OFFSET * 2,
            };
            localCurrentRootX += ROOT_X_SPACING;
          }
        }

        const validPaletteKeys: Array<PaletteColorKey | undefined | ''> = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', undefined, ''];
        if (!validPaletteKeys.includes(node.customBackgroundColor)) {
             newNodes[nodeId] = { ...node, customBackgroundColor: undefined };
             needsUpdate = true;
        }
        if (node.customBackgroundColor === '') { 
            newNodes[nodeId] = { ...node, customBackgroundColor: undefined };
            needsUpdate = true;
        }
      });
      
      currentRootXGlobal = Math.max(currentRootXGlobal, localCurrentRootX);

      const updatedData = { ...m.data, nodes: newNodes, rootNodeIds };
      if (needsUpdate) {
        return { ...m, data: updatedData, updatedAt: new Date().toISOString() };
      }
      return { ...m, data: updatedData, updatedAt: m.updatedAt || new Date().toISOString() }; 
    });

    setMindmaps(migratedMindmaps);
    setIsLoading(false);
  }, [ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);

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
            const siblingCount = parentChildIds.length;
            x = (parentNode.x ?? INITIAL_ROOT_X) + CHILD_X_OFFSET + (siblingCount * (NODE_CARD_WIDTH + 30));
            y = (parentNode.y ?? INITIAL_ROOT_Y) + CHILD_Y_OFFSET;
        }
    } else {
        if (currentRootNodeIds.length > 0) {
            const lastRootNodeId = currentRootNodeIds[currentRootNodeIds.length -1];
            const lastRootNode = mindmap.data.nodes[lastRootNodeId];
            x = (lastRootNode?.x ?? (INITIAL_ROOT_X - ROOT_X_SPACING)) + ROOT_X_SPACING;
        } else {
            x = INITIAL_ROOT_X;
        }
        y = INITIAL_ROOT_Y;
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
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
  }, [getMindmapById, updateMindmap, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNodeData: NodeData = {
      ...mindmap.data.nodes[nodeId],
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
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
