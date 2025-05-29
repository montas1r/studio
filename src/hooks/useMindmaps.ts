
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useState, useEffect, useCallback } from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

export function useMindmaps() {
  const NODE_CARD_WIDTH = 300;
  const INITIAL_ROOT_X = 0;
  const INITIAL_ROOT_Y = 0;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0;
  const CHILD_Y_OFFSET = 180; // Approx height of a node card + spacing

  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 100; // Default/minimum height
    let height = 50; // Base padding and header area
    if (node.title) {
      height += 28; // Adjusted for text-lg
    }
    if (node.description && node.description.trim() !== "") {
      const charWidth = 8; // Rough approximation for average char width for text-sm
      const charsPerLine = Math.max(1, (NODE_CARD_WIDTH - 2 * 12 /* p-3 padding */) / charWidth);
      const linesFromDesc = Math.ceil((node.description.length / charsPerLine)) + (node.description.split('\\n').length - 1);
      height += Math.max(20, linesFromDesc * 20); // Adjusted for text-sm line height
    } else {
      height += 20; // Empty description box still takes some space
    }
    // No image height calculation in v0.0.5
    return Math.max(100, height); // Ensure a minimum height
  }, []);


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      
      let nextRootX = INITIAL_ROOT_X;
      let nextRootY = INITIAL_ROOT_Y;

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      
      const assignPositions = (nodeId: string, parentNode?: NodeData, siblingIndex: number = 0) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) {
          if (parentNode) { 
            const parentX = parentNode.x ?? INITIAL_ROOT_X;
            const parentY = parentNode.y ?? INITIAL_ROOT_Y;
            const parentNodeHeight = getApproxNodeHeight(parentNode);
            
            x = parentX + CHILD_X_OFFSET; 
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
            
            if (parentNode.childIds && parentNode.childIds.length > 1) {
                const totalWidthOfChildren = parentNode.childIds.length * NODE_CARD_WIDTH + (parentNode.childIds.length -1) * 30;
                const startX = parentX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (NODE_CARD_WIDTH + 30);
            } else if (parentNode.childIds && parentNode.childIds.length === 1){
                x = parentX; // Center first child under parent
            }
          } else { // This is a root node
            x = nextRootX;
            y = nextRootY;
            nextRootX += ROOT_X_SPACING;
          }
          migratedNodes[nodeId] = { ...node, x, y };
        } else {
          migratedNodes[nodeId] = { ...node };
        }
        
        if (Array.isArray(node.childIds)) {
          node.childIds.forEach((childId, index) => {
            assignPositions(childId, migratedNodes[nodeId], index);
          });
        }
      };

      rootsToProcess.forEach(rootId => assignPositions(rootId));

      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) {
          const node = m.data.nodes[nodeId];
          migratedNodes[nodeId] = { 
            ...node, 
            x: node.x === undefined ? nextRootX : node.x, 
            y: node.y === undefined ? nextRootY : node.y 
          };
          if (node.x === undefined) nextRootX += ROOT_X_SPACING;
        }
      });
      
      return {
        ...m,
        updatedAt: m.updatedAt || new Date().toISOString(),
        data: {
          ...m.data,
          nodes: migratedNodes,
          rootNodeIds: Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : []
        }
      };
    }));
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput): NodeData | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 5000; // As per v0.0.3
    const Y_OFFSET_FOR_FIRST_ROOT = 100; // As per v0.0.3

    const newNodeId = uuidv4();
    let x, y;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];

    if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? INITIAL_ROOT_X;
        const parentNodeY = parentNode.y ?? INITIAL_ROOT_Y;
        const parentNodeHeight = getApproxNodeHeight(parentNode);
        const siblingCount = (parentNode.childIds || []).length;

        x = parentNodeX + CHILD_X_OFFSET;
        y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET;

        if (siblingCount > 0) {
           const totalWidthOfChildren = (siblingCount + 1) * NODE_CARD_WIDTH + siblingCount * 30;
           const startX = parentNodeX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (NODE_CARD_WIDTH + 30);
        } else { // First child
           x = parentNodeX; 
        }
      } else { // Parent ID provided but not found, treat as new root
        parentId = null; 
        const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
        if (existingRootNodes.length > 0) {
          const lastRootNode = existingRootNodes.reduce((latest, node) => (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest, existingRootNodes[0]!);
          x = (lastRootNode.x ?? INITIAL_ROOT_X) + ROOT_X_SPACING;
          y = lastRootNode.y ?? INITIAL_ROOT_Y;
        } else {
          x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
          y = Y_OFFSET_FOR_FIRST_ROOT;
        }
      }
    } else { // New root node
      const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
      if (existingRootNodes.length > 0) {
         const lastRootNode = existingRootNodes.reduce((latest, node) => {
              return (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest;
         }, existingRootNodes[0]!);
         x = (lastRootNode.x ?? INITIAL_ROOT_X) + ROOT_X_SPACING;
         y = lastRootNode.y ?? Y_OFFSET_FOR_FIRST_ROOT; // Ensure new roots are on the same Y level
      } else { // Very first node in the mindmap
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
        y = Y_OFFSET_FOR_FIRST_ROOT;
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
      customBorderColor: nodeDetails.customBorderColor === 'no-custom-color' ? undefined : nodeDetails.customBorderColor,
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
  }, [getMindmapById, updateMindmap, getApproxNodeHeight, NODE_CARD_WIDTH, INITIAL_ROOT_X, INITIAL_ROOT_Y, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      customBorderColor: updates.customBorderColor === 'no-custom-color' ? undefined : updates.customBorderColor,
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
    getApproxNodeHeight,
  };
}
