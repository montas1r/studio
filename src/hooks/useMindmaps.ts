
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { useState, useEffect, useCallback }
from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 2000;
const Y_OFFSET_FOR_FIRST_ROOT = 100;

export const NODE_CARD_WIDTH = 320; 
const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
const CHILD_X_OFFSET = 0;
const CHILD_Y_OFFSET = 180;

export const MIN_NODE_WIDTH = 200;
export const MAX_NODE_WIDTH = 600;
export const MIN_NODE_HEIGHT = 90;
export const MAX_NODE_HEIGHT = 800;


export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return MIN_NODE_HEIGHT;
    
    let height = 0;
    height += (16 + 28); // Header py-2 (16px) + text-lg (28px)

    const currentCardWidth = node.width ?? NODE_CARD_WIDTH;

    if (node.title) {
      const titleCharsPerLine = Math.max(1, (currentCardWidth - (2 * 16) - (node.emoji ? 32 : 0) - 70) / 10);
      const numTitleLines = Math.ceil((node.title.length / titleCharsPerLine)) + (node.title.split('\n').length -1);
      if (numTitleLines > 1) {
        height += (numTitleLines - 1) * 28; 
      }
    }
    
    height += 24; // Description box py-3 padding (12px top + 12px bottom)
    if (node.description && node.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (currentCardWidth - (2 * 16)) / 8);
      const numDescLines = Math.ceil((node.description.length / descCharsPerLine)) + (node.description.split('\n').length -1);
      height += Math.max(24, numDescLines * 20); // Ensure at least 24px for content (min-h-[24px]) or lines * 20px line height
    } else {
      height += 24; // For the min-h-[24px] of the empty description content box itself
    }
    
    height += 4; // Account for top and bottom border of the card itself (2px + 2px)
    return Math.max(MIN_NODE_HEIGHT, height);
  }, []);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];

      const assignPositions = (nodeId: string, parentNodeData?: NodeData, siblingIndex: number = 0, isFirstRootInMap: boolean = false) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        const nodeWidth = node.width ?? NODE_CARD_WIDTH;
        const nodeHeight = node.height ?? getApproxNodeHeight({...node, width: nodeWidth});


        if (node.x === undefined || node.y === undefined) {
          if (parentNodeData) {
            const parentX = parentNodeData.x ?? nextRootX;
            const parentY = parentNodeData.y ?? Y_OFFSET_FOR_FIRST_ROOT;
            const parentNodeHeightValue = parentNodeData.height ?? getApproxNodeHeight(parentNodeData);
            const parentNodeWidthValue = parentNodeData.width ?? NODE_CARD_WIDTH;

            y = parentY + parentNodeHeightValue + CHILD_Y_OFFSET;

            const childrenCount = parentNodeData.childIds?.length || 0;
            if (childrenCount > 1) {
                const totalWidthOfChildren = childrenCount * nodeWidth + (childrenCount -1) * 30;
                const startX = parentX + (parentNodeWidthValue / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (nodeWidth + 30);
            } else {
                x = parentX + (parentNodeWidthValue / 2) - (nodeWidth / 2) + CHILD_X_OFFSET;
            }
          } else {
            if (isFirstRootInMap && rootsToProcess.length === 1) {
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (nodeWidth / 2);
                y = Y_OFFSET_FOR_FIRST_ROOT;
            } else {
                x = nextRootX;
                y = Y_OFFSET_FOR_FIRST_ROOT;
                nextRootX += nodeWidth + (ROOT_X_SPACING - NODE_CARD_WIDTH) ;
            }
          }
          migratedNodes[nodeId] = { ...node, x, y, width: nodeWidth, height: nodeHeight };
        } else {
           migratedNodes[nodeId] = { ...node, width: nodeWidth, height: node.height ?? getApproxNodeHeight({...node, width: nodeWidth}) };
          if (!parentNodeData && node.x !== undefined && (node.x + nodeWidth + ROOT_X_SPACING - NODE_CARD_WIDTH) > nextRootX) {
            nextRootX = node.x + nodeWidth + ROOT_X_SPACING - NODE_CARD_WIDTH;
          }
        }

        if (Array.isArray(node.childIds)) {
          node.childIds.forEach((childId, index) => {
            assignPositions(childId, migratedNodes[nodeId], index, false);
          });
        }
      };
      rootsToProcess.forEach((rootId, index) => assignPositions(rootId, undefined, 0, index === 0));
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) {
          const node = m.data.nodes[nodeId];
           migratedNodes[nodeId] = {
            ...node,
            x: node.x === undefined ? nextRootX : node.x,
            y: node.y === undefined ? Y_OFFSET_FOR_FIRST_ROOT : node.y,
            width: node.width ?? NODE_CARD_WIDTH,
            height: node.height ?? getApproxNodeHeight({...node, width: node.width ?? NODE_CARD_WIDTH}),
          };
          if (node.x === undefined && !node.parentId) nextRootX += ((node.width ?? NODE_CARD_WIDTH) + ROOT_X_SPACING - NODE_CARD_WIDTH);
        }
      });

      return {
        ...m,
        updatedAt: m.updatedAt || new Date().toISOString(),
        createdAt: m.createdAt || new Date().toISOString(),
        data: {
          ...m.data,
          nodes: migratedNodes,
          rootNodeIds: Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : []
        }
      };
    }));
    setIsLoading(false);
  }, [getApproxNodeHeight]);

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

  const updateMindmap = useCallback((id: string, updatedData: Partial<Omit<Mindmap, 'id' | 'createdAt'>>): Mindmap | undefined => {
    let changedMindmap: Mindmap | undefined;
    setMindmaps(prev =>
      prev.map(m => {
        if (m.id === id) {
          const newMapData: MindmapData = {
            ...m.data, 
            ...(updatedData.data || {}), 
          };
          changedMindmap = { 
            ...m, 
            ...updatedData, 
            data: newMapData, 
            updatedAt: new Date().toISOString() 
          };
          return changedMindmap;
        }
        return m;
      })
    );
    return changedMindmap;
  }, []);

  const deleteMindmap = useCallback((id: string) => {
    setMindmaps(prev => prev.filter(m => m.id !== id));
  }, []);

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput): NodeData | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x, y;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean) as NodeData[];

    const newNodeInitialWidth = NODE_CARD_WIDTH; 
    const tempNodeForHeightCalc: Partial<NodeData> = { ...nodeDetails, width: newNodeInitialWidth };
    const newNodeInitialHeight = getApproxNodeHeight(tempNodeForHeightCalc);


    if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
        const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
        const parentNodeHeightValue = parentNode.height ?? getApproxNodeHeight(parentNode);
        const parentNodeWidthValue = parentNode.width ?? NODE_CARD_WIDTH;
        const siblingCount = (parentNode.childIds || []).length;

        y = parentNodeY + parentNodeHeightValue + CHILD_Y_OFFSET;

        if (siblingCount > 0) {
           const totalWidthOfChildren = (siblingCount + 1) * newNodeInitialWidth + siblingCount * 30; 
           const startX = parentNodeX + (parentNodeWidthValue / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (newNodeInitialWidth + 30);
        } else {
           x = parentNodeX + (parentNodeWidthValue / 2) - (newNodeInitialWidth / 2) + CHILD_X_OFFSET;
        }
      } else {
        parentId = null; 
        const lastRootNode = existingRootNodes.length > 0 ? existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1] : null;
        x = (lastRootNode?.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2) - ROOT_X_SPACING) ) + ROOT_X_SPACING;
        y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    } else { 
      if (existingRootNodes.length === 0) {
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (newNodeInitialWidth / 2);
        y = Y_OFFSET_FOR_FIRST_ROOT;
      } else {
         const lastRootNode = existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1];
         const lastRootNodeWidthValue = lastRootNode.width ?? NODE_CARD_WIDTH;
         x = (lastRootNode.x ?? 0) + lastRootNodeWidthValue + (ROOT_X_SPACING - NODE_CARD_WIDTH);
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
      x: x,
      y: y,
      width: newNodeInitialWidth, 
      height: newNodeInitialHeight,
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
    const updatedMindmap = updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return updatedMindmap ? updatedMindmap.data.nodes[newNodeId] : undefined;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const nodeWidth = existingNode.width ?? NODE_CARD_WIDTH; 
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      width: nodeWidth, 
      height: getApproxNodeHeight({ ...existingNode, ...updates, width: nodeWidth }) 
    };

    const updatedNodes = {
      ...mindmap.data.nodes,
      [nodeId]: updatedNodeData
    };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap, getApproxNodeHeight]);

  const updateNodePosition = useCallback((mindmapId: string, nodeId: string, x: number, y: number): Mindmap | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return undefined;

    const updatedNode = { ...mindmap.data.nodes[nodeId], x, y };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    return updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const updateNodeDimensions = useCallback((mindmapId: string, nodeId: string, dimensions: { width: number; height: number }) => {
    setMindmaps(prevMindmaps =>
      prevMindmaps.map(m => {
        if (m.id === mindmapId) {
          const mindmapNodes = m.data.nodes;
          const existingNode = mindmapNodes[nodeId];

          if (!existingNode) {
            return m; 
          }

          const newWidth = Math.max(MIN_NODE_WIDTH, Math.min(Math.round(dimensions.width), MAX_NODE_WIDTH));
          const newHeight = Math.max(MIN_NODE_HEIGHT, Math.min(Math.round(dimensions.height), MAX_NODE_HEIGHT));

          const currentWidth = existingNode.width ?? NODE_CARD_WIDTH;
          // Use getApproxNodeHeight for comparison if existingNode.height is not set.
          const currentHeight = existingNode.height ?? getApproxNodeHeight(existingNode); 

          if (Math.abs(currentWidth - newWidth) < 1 && Math.abs(currentHeight - newHeight) < 1) {
            return m; 
          }

          const updatedNodeData: NodeData = {
            ...existingNode,
            width: newWidth,
            height: newHeight,
          };

          const updatedNodes: NodesObject = {
            ...mindmapNodes,
            [nodeId]: updatedNodeData,
          };
          
          return {
            ...m,
            data: {
              ...m.data,
              nodes: updatedNodes,
            },
            updatedAt: new Date().toISOString(),
          };
        }
        return m;
      })
    );
  }, [getApproxNodeHeight]);


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
    updateNodeDimensions,
    deleteNode,
    getApproxNodeHeight,
    NODE_CARD_WIDTH,
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH,
    MIN_NODE_HEIGHT,
    MAX_NODE_HEIGHT,
  };
}

    
